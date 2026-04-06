"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockGrants } from "@/data/mock-grants";
import { getDeadlineLabel } from "@/lib/format";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
} from "date-fns";
import { ko } from "date-fns/locale";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Build grant deadline map
  const deadlineMap = useMemo(() => {
    const map = new Map<string, typeof mockGrants>();
    for (const grant of mockGrants) {
      const dateKey = grant.applicationEnd;
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(grant);
    }
    return map;
  }, []);

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const days: Date[] = [];
    let day = calStart;
    while (day <= calEnd) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [currentMonth]);

  // Grants for selected date
  const selectedGrants = useMemo(() => {
    if (!selectedDate) return [];
    const dateKey = format(selectedDate, "yyyy-MM-dd");
    return deadlineMap.get(dateKey) || [];
  }, [selectedDate, deadlineMap]);

  const getGrantsForDay = (day: Date) => {
    const dateKey = format(day, "yyyy-MM-dd");
    return deadlineMap.get(dateKey) || [];
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-6 flex items-center gap-2 text-2xl font-bold text-gray-900">
        <CalendarIcon className="h-6 w-6 text-blue-600" />
        마감 캘린더
      </h1>

      <Card className="mb-6 p-4">
        {/* Month Navigation */}
        <div className="mb-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-bold text-gray-900">
            {format(currentMonth, "yyyy년 M월", { locale: ko })}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Day Names */}
        <div className="mb-1 grid grid-cols-7">
          {DAY_NAMES.map((name, i) => (
            <div
              key={name}
              className={`py-2 text-center text-xs font-medium ${
                i === 0
                  ? "text-red-400"
                  : i === 6
                    ? "text-blue-400"
                    : "text-gray-400"
              }`}
            >
              {name}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, i) => {
            const grants = getGrantsForDay(day);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isToday = isSameDay(day, new Date());
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const dayOfWeek = day.getDay();

            return (
              <button
                key={i}
                onClick={() => setSelectedDate(day)}
                className={`relative flex min-h-[48px] flex-col items-center gap-0.5 rounded-lg p-1 text-sm transition-colors ${
                  !isCurrentMonth
                    ? "text-gray-300"
                    : isSelected
                      ? "bg-blue-100 font-medium text-blue-700"
                      : isToday
                        ? "bg-gray-100 font-medium text-gray-900"
                        : dayOfWeek === 0
                          ? "text-red-500 hover:bg-gray-50"
                          : dayOfWeek === 6
                            ? "text-blue-500 hover:bg-gray-50"
                            : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span>{format(day, "d")}</span>
                {grants.length > 0 && isCurrentMonth && (
                  <div className="flex gap-0.5">
                    {grants.slice(0, 3).map((_, j) => (
                      <span
                        key={j}
                        className="h-1.5 w-1.5 rounded-full bg-blue-500"
                      />
                    ))}
                    {grants.length > 3 && (
                      <span className="text-[8px] text-blue-500">+</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Selected Day Grants */}
      {selectedDate && (
        <div>
          <h3 className="mb-3 font-semibold text-gray-900">
            {format(selectedDate, "M월 d일", { locale: ko })} 마감 과제
            <span className="ml-2 text-sm font-normal text-gray-400">
              {selectedGrants.length}건
            </span>
          </h3>
          {selectedGrants.length > 0 ? (
            <div className="space-y-3">
              {selectedGrants.map((grant) => {
                const dl = getDeadlineLabel(grant.applicationEnd);
                return (
                  <Link key={grant.id} href={`/grants/${grant.id}`}>
                    <Card className="p-4 transition-shadow hover:shadow-md">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="mb-1 flex items-center gap-2">
                            <Badge variant="secondary">{grant.category}</Badge>
                            {dl.urgent && (
                              <Badge variant="destructive" className="text-xs">
                                {dl.text}
                              </Badge>
                            )}
                          </div>
                          <h4 className="font-medium text-gray-900">
                            {grant.title}
                          </h4>
                          <p className="mt-1 text-sm text-gray-500">
                            {grant.organization} | {grant.region}
                          </p>
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <Card className="p-6 text-center text-gray-400">
              해당 날짜에 마감하는 과제가 없습니다
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
