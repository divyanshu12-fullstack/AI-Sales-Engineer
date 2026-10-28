import type { ConsultationSlot } from '@asterbyte/contracts';

// Fixed IST (no daylight saving) consultation rules agreed for the demo.
export const consultationRules = {
  timezone: 'Asia/Kolkata' as const,
  durationMinutes: 30,
  startMinute: 11 * 60,
  lastStartMinute: 17 * 60 + 30,
  minNoticeHours: 24,
  lookaheadDays: 14,
  maxSlots: 3,
};
const IST_OFFSET_MINUTES = 330;
const DAY_MS = 86_400_000;

export type Consultant = {
  id: string;
  full_name: string;
  team: string;
  role_title: string;
  skills: string[];
  consultation_topics: string[];
};
export type BusyMeeting = {
  consultant_employee_id: string;
  requested_start_at: string;
  duration_minutes: number;
  status?: string;
  confirmation_expires_at?: string | null;
};
export type AvailabilityInput = {
  now: Date;
  topic: string;
  preferredDate: string;
  preferredPeriod: 'any' | 'morning' | 'afternoon';
  consultants: Consultant[];
  meetings: BusyMeeting[];
  maxSlots?: number;
};

const words = (value: string): string[] =>
  value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word.length > 2);

export const consultantScore = (topic: string, consultant: Consultant): number => {
  const topicText = ` ${words(topic).join(' ')} `;
  const terms = [...consultant.skills, ...consultant.consultation_topics];
  let score = 0;
  for (const term of terms) {
    const normalized = words(term).join(' ');
    if (normalized.length < 3) continue;
    if (topicText.includes(` ${normalized} `)) score += 3;
    else score += words(term).filter((word) => topicText.includes(` ${word} `)).length;
  }
  return score;
};

export const rankConsultants = (topic: string, consultants: Consultant[]): Consultant[] => {
  const ranked = consultants
    .map((consultant) => ({ consultant, score: consultantScore(topic, consultant) }))
    .sort(
      (a, b) =>
        b.score - a.score || a.consultant.full_name.localeCompare(b.consultant.full_name, 'en'),
    );
  if (ranked[0] && ranked[0].score > 0)
    return ranked.filter((entry) => entry.score > 0).map((entry) => entry.consultant);
  return ranked.map((entry) => entry.consultant);
};

const istDateParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: consultationRules.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value ?? '0');
  return { year: part('year'), month: part('month'), day: part('day') };
};

const dateKey = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export const consultationDateKey = (startAt: string | Date): string => {
  const parts = istDateParts(typeof startAt === 'string' ? new Date(startAt) : startAt);
  return dateKey(parts.year, parts.month, parts.day);
};

const istWallTimeToUtc = (year: number, month: number, day: number, minutes: number): Date =>
  new Date(
    Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60) -
      IST_OFFSET_MINUTES * 60_000,
  );

export const consultationDisplay = (startAt: string | Date): string =>
  `${new Intl.DateTimeFormat('en-IN', {
    timeZone: consultationRules.timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(typeof startAt === 'string' ? new Date(startAt) : startAt)} IST`;

export const availableSlots = ({
  now,
  topic,
  preferredDate,
  preferredPeriod,
  consultants,
  meetings,
  maxSlots,
}: AvailabilityInput): ConsultationSlot[] => {
  const limit = maxSlots ?? consultationRules.maxSlots;
  const eligible = rankConsultants(topic, consultants);
  if (!eligible.length) return [];
  const busy = new Map<string, Array<[number, number]>>();
  for (const meeting of meetings) {
    if (
      meeting.status === 'pending_confirmation' &&
      meeting.confirmation_expires_at &&
      Date.parse(meeting.confirmation_expires_at) <= now.getTime()
    )
      continue;
    const start = Date.parse(meeting.requested_start_at);
    if (!Number.isFinite(start) || !Number.isFinite(meeting.duration_minutes)) continue;
    const ranges = busy.get(meeting.consultant_employee_id) ?? [];
    ranges.push([start, start + meeting.duration_minutes * 60_000]);
    busy.set(meeting.consultant_employee_id, ranges);
  }
  const isFree = (consultantId: string, start: number) =>
    !(busy.get(consultantId) ?? []).some(([from, to]) => start < to && start + 30 * 60_000 > from);
  const earliest = now.getTime() + consultationRules.minNoticeHours * 3_600_000;
  const latest = now.getTime() + consultationRules.lookaheadDays * DAY_MS;
  const startDate = istDateParts(now);
  const slots: ConsultationSlot[] = [];

  for (let offset = 0; offset <= consultationRules.lookaheadDays; offset++) {
    const calendar = new Date(
      Date.UTC(startDate.year, startDate.month - 1, startDate.day + offset),
    );
    const year = calendar.getUTCFullYear();
    const month = calendar.getUTCMonth() + 1;
    const day = calendar.getUTCDate();
    const dayOfWeek = calendar.getUTCDay();
    if (dayOfWeek === 0) continue; // Sunday is closed.
    if (preferredDate && preferredDate !== dateKey(year, month, day)) continue;
    for (
      let minutes = consultationRules.startMinute;
      minutes <= consultationRules.lastStartMinute;
      minutes += 30
    ) {
      if (preferredPeriod === 'morning' && minutes >= 13 * 60) continue;
      if (preferredPeriod === 'afternoon' && minutes < 13 * 60) continue;
      const start = istWallTimeToUtc(year, month, day, minutes);
      const timestamp = start.getTime();
      if (timestamp < earliest || timestamp > latest) continue;
      const consultant = eligible.find((person) => isFree(person.id, timestamp));
      if (!consultant) continue;
      slots.push({
        start_at: start.toISOString(),
        display: consultationDisplay(start),
        consultant_id: consultant.id,
        consultant_name: consultant.full_name,
      });
      if (slots.length >= limit) return slots;
    }
  }
  return slots;
};
