import dayjs, { type Dayjs } from "dayjs";
import durationDayJS from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import * as chrono from "chrono-node";
import { readable } from "svelte/store";

export let dayNamesFull = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export let dayNamesShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export let dayNamesShort2 = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
export let monthNamesFull = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export let monthNamesShort = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
];

// store day-month-year
let oldToday = new Date();

// trigger today change when a day changes
export const today = readable(new Date(), (set) => {
  let incrementCounter = setInterval(() => {
    let newVal = new Date();
    if (
      newVal.getDate() != oldToday.getDate() ||
      newVal.getMonth() != oldToday.getMonth() ||
      newVal.getFullYear() != oldToday.getFullYear()
    ) {
      set(newVal);
      oldToday = newVal;
    }
  }, 1000 * 60);
  return () => {
    clearInterval(incrementCounter);
  };
});

export function getAge(birthDate: string | Date): number {
  let date: Date | undefined;
  if (typeof birthDate === "string") {
    date = new Date(birthDate);
  } else if (birthDate instanceof Date) {
    date = birthDate;
  }
  if (!date) {
    return 0;
  }

  let now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  let m = now.getMonth() - date.getMonth();
  return Math.round(
    m < 0 || (m === 0 && now.getDate() < date.getDate()) ? age - 1 : age,
  );
}

const parsers = [/\b\d{1,2}\.\d{1,2}\.\d{4}\b/g];

export function parseDate(text: string): string {
  let date: string | undefined;

  parsers.forEach((parser) => {
    const match = text.match(parser);

    // convert all matches to dates, select the newest one and return it ISO string
    if (match) {
      const dates = match
        .map((date) => {
          const parsed = chrono.parseDate(date);
          return parsed ? new Date(parsed) : null;
        })
        .filter((date) => {
          return date != null;
        })
        .sort((a, b) => {
          return a.getTime() - b.getTime();
        });
      if (dates.length > 0) {
        date = dates[dates.length - 1].toISOString();
      }
    }
  });

  if (date != undefined) {
    return date;
  } else {
    const parsedDate = chrono.parseDate(text);
    if (parsedDate) {
      return new Date(parsedDate).toISOString();
    } else {
      return "";
    }
  }
}

dayjs.extend(durationDayJS);
dayjs.extend(relativeTime);

const formatDateTime = "DD.MM.YYYY HH:mm";
const formatDate = "DD.MM.YYYY";
const formatTime = "HH:mm";

export function durationFromFormatted(
  format: "days" | "months" | "years" = "days",
  dataFrom: string | Date | number,
  dataTo: string | Date | number = new Date(),
): number {
  return dayjs(dataTo).diff(dayjs(dataFrom), format);
}

export function durationFrom(dataFrom: string | Date | number): {
  format: "days" | "months" | "years";
  value: number;
} {
  const days = durationFromFormatted("days", dataFrom);
  if (days > 400) {
    // duration in years
    return {
      value: durationFromFormatted("years", dataFrom),
      format: "years",
    };
  }
  if (days > 30) {
    // duration in months
    return {
      value: durationFromFormatted("months", dataFrom),
      format: "months",
    };
  }

  // duration in days
  return {
    value: days,
    format: "days",
  };
}

export function core(
  date: string | Date | number | undefined,
): Dayjs | undefined {
  if (date == undefined) {
    return date;
  }
  return dayjs(date);
}

export function date(
  date: string | Date | number | undefined,
  format: string | undefined = undefined,
): string | undefined {
  if (date == undefined) {
    return date;
  }
  return dayjs(date).format(format || formatDate);
}

export function time(
  date: string | Date | number | undefined,
  format: string | undefined = undefined,
): string | undefined {
  if (date == undefined) {
    return date;
  }
  return dayjs(date).format(format || formatTime);
}

export function dateTime(
  date: string | Date | number | undefined,
  format: string | undefined = undefined,
): string | undefined {
  if (date == undefined) {
    return date;
  }
  return dayjs(date).format(format || formatDateTime);
}

export function duration(
  durationInput: string | undefined,
): string | undefined {
  if (durationInput == undefined) {
    return durationInput;
  }
  return dayjs.duration(durationInput).humanize();
}

export function durationInMinutes(durationInput: string | undefined): number {
  if (durationInput == undefined) {
    return 0;
  }
  return dayjs.duration(durationInput).asMinutes();
}

export function toOADate(date: Date): number {
  const timezoneOffset = date.getTimezoneOffset() / (60 * 24);
  const msDateObj = date.getTime() / 86400000 + (25569 - timezoneOffset);
  return msDateObj;
}

export function fromOADate(oadate: number): Date {
  const date = new Date((oadate - 25569) * 86400000);
  const tz = date.getTimezoneOffset();
  return new Date((oadate - 25569 + tz / (60 * 24)) * 86400000);
}

export function fromDicomDate(date: string, time?: string): Date {
  let timeParsed: string | undefined = undefined;
  if (time) {
    let [time1, time2] = time.split(".");
    timeParsed =
      time1.substring(0, 2) +
      ":" +
      time1.substring(2, 4) +
      ":" +
      time1.substring(4, 6);
    if (time2) {
      timeParsed += "." + time2.substring(0, 3) + "Z";
    } else {
      timeParsed += ".000Z";
    }
  }
  date = [
    date.substring(0, 4),
    date.substring(4, 6),
    date.substring(6, 8),
  ].join("-");
  return new Date(date + "T" + (timeParsed || "00:00:00.000Z"));
}

export function toISOString(date: Date | string): string {
  const d = dayjs(date);
  return d.toISOString();
}
