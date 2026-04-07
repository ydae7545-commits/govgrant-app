import { type NextRequest } from "next/server";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { createClient } from "@/lib/supabase/server";
import { featureFlags } from "@/lib/env";
import {
  SECTION_LABELS,
  SECTION_ORDER,
  type ProposalSections,
} from "@/types/proposal";

/**
 * GET /proposals/[id]/download?format=md|docx
 *
 * Returns the proposal as a single Markdown file or a DOCX document.
 * Filled sections only — empty sections are skipped so a partial draft
 * still produces a clean export.
 */

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!featureFlags.useProposalAi) {
    return new Response("feature_disabled", { status: 403 });
  }

  const { id } = await ctx.params;
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "md").toLowerCase();

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response("unauthorized", { status: 401 });
  }

  const { data: proposalRow, error } = await supabase
    .from("proposals")
    .select("title, sections")
    .eq("id", id)
    .maybeSingle();
  if (error || !proposalRow) {
    return new Response("not_found", { status: 404 });
  }

  const title = (proposalRow.title as string) ?? "사업계획서";
  const sections = ((proposalRow.sections as ProposalSections) ??
    {}) as ProposalSections;

  const safeFilename = sanitizeFilename(title);

  if (format === "md") {
    try {
      const md = renderMarkdown(title, sections);
      return new Response(md, {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": buildContentDisposition(safeFilename, "md"),
          "cache-control": "no-store",
        },
      });
    } catch (err) {
      console.error("[govgrant-proposal:download:md]", err);
      return new Response(
        `md_render_failed: ${err instanceof Error ? err.message : String(err)}`,
        { status: 500 }
      );
    }
  }

  if (format === "docx") {
    try {
      const buf = await renderDocx(title, sections);
      // Buffer is a Uint8Array subclass but Web Response expects ArrayBuffer
      // / Uint8Array / Blob. Slice into a fresh Uint8Array to avoid Node↔Web
      // type quirks in Next.js 16.
      const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      return new Response(bytes as unknown as BodyInit, {
        headers: {
          "content-type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "content-disposition": buildContentDisposition(safeFilename, "docx"),
          "content-length": String(bytes.byteLength),
          "cache-control": "no-store",
        },
      });
    } catch (err) {
      console.error("[govgrant-proposal:download:docx]", err);
      return new Response(
        `docx_render_failed: ${err instanceof Error ? err.message : String(err)}`,
        { status: 500 }
      );
    }
  }

  return new Response("invalid_format", { status: 400 });
}

function sanitizeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "proposal";
}

/**
 * HTTP `content-disposition` headers are ByteString — non-ASCII characters
 * (e.g. Korean) throw at the Response constructor. We always send a safe
 * ASCII fallback in `filename=` and the real UTF-8 name in `filename*=...`
 * (RFC 5987). Browsers that understand `filename*` will use the Korean
 * name; older clients fall back to the ASCII version.
 */
function buildContentDisposition(name: string, ext: string): string {
  const utf8 = encodeURIComponent(`${name}.${ext}`);
  // ASCII fallback: strip everything that isn't safe.
  const ascii =
    name.replace(/[^\x20-\x7e]/g, "_").replace(/[\\/:*?"<>|]/g, "_") ||
    "proposal";
  return `attachment; filename="${ascii}.${ext}"; filename*=UTF-8''${utf8}`;
}

function renderMarkdown(title: string, sections: ProposalSections): string {
  const out: string[] = [`# ${title}`, ""];
  for (const key of SECTION_ORDER) {
    const sec = sections[key];
    if (!sec) continue;
    // Strip any leading "## ..." the model added so we control hierarchy.
    const body = sec.content.replace(/^\s*##\s+.*\n?/, "").trim();
    out.push(`## ${SECTION_LABELS[key]}`, "", body, "");
  }
  return out.join("\n");
}

/**
 * Minimal Markdown → DOCX renderer.
 *
 * Supports headings (#, ##, ###), blank-line paragraph splitting, bullet
 * list markers (-, *), and bold/italic inline runs. Tables and code blocks
 * fall back to plain paragraphs (good enough for v1; richer rendering can
 * come later).
 */
async function renderDocx(
  title: string,
  sections: ProposalSections
): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: title, bold: true, size: 32 })],
    })
  );
  children.push(new Paragraph({ text: "" }));

  for (const key of SECTION_ORDER) {
    const sec = sections[key];
    if (!sec) continue;

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [
          new TextRun({ text: SECTION_LABELS[key], bold: true, size: 28 }),
        ],
      })
    );

    const body = sec.content.replace(/^\s*##\s+.*\n?/, "").trim();
    appendMarkdownBody(children, body);
    children.push(new Paragraph({ text: "" }));
  }

  const doc = new Document({
    creator: "govgrant-app",
    title,
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

function appendMarkdownBody(out: Paragraph[], md: string) {
  const lines = md.split("\n");
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim()) {
      out.push(new Paragraph({ text: "" }));
      continue;
    }

    // Headings inside section body
    if (line.startsWith("### ")) {
      out.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: line.slice(4), bold: true })],
        })
      );
      continue;
    }
    if (line.startsWith("## ")) {
      out.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: line.slice(3), bold: true })],
        })
      );
      continue;
    }

    // List items
    const listMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (listMatch) {
      out.push(
        new Paragraph({
          bullet: { level: 0 },
          children: parseInline(listMatch[1]),
        })
      );
      continue;
    }

    out.push(new Paragraph({ children: parseInline(line) }));
  }
}

/**
 * Very small inline parser: handles **bold** and *italic*. Anything else
 * passes through as plain text.
 */
function parseInline(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, m.index) }));
    }
    if (m[2] !== undefined) {
      runs.push(new TextRun({ text: m[2], bold: true }));
    } else if (m[3] !== undefined) {
      runs.push(new TextRun({ text: m[3], italics: true }));
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex) }));
  }
  if (runs.length === 0) runs.push(new TextRun({ text: "" }));
  return runs;
}
