import { format } from 'date-fns';

const DATE_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

const isUtcMidnight = (value) => (
  value.getUTCHours() === 0
  && value.getUTCMinutes() === 0
  && value.getUTCSeconds() === 0
  && value.getUTCMilliseconds() === 0
);

const pad = (value) => String(value).padStart(2, '0');

export const parseDateInputValue = (value) => {
  if (typeof value !== 'string') return null;
  const match = DATE_INPUT_RE.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day, 0, 0, 0, 0);

  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== monthIndex
    || parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
};

export const normalizeDreamCalendarDate = (value) => {
  if (!isValidDate(value)) return null;
  if (isUtcMidnight(value)) {
    return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0);
  }
  return value;
};

export const formatDreamDate = (value, pattern = 'MMM d, yyyy') => {
  const normalized = normalizeDreamCalendarDate(value);
  return normalized ? format(normalized, pattern) : '';
};

export const formatDateInputValue = (value) => {
  const normalized = normalizeDreamCalendarDate(value);
  if (!normalized) return '';
  return `${normalized.getFullYear()}-${pad(normalized.getMonth() + 1)}-${pad(normalized.getDate())}`;
};

export const getTodayDateInputValue = () => formatDateInputValue(new Date());