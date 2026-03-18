import type { MedicationDocument, MedicationOccurrence, MedicationSchedule, AdherenceStatus, AdherenceRecord } from './types';

/**
 * Calculate all occurrences for a medication within a date range.
 */
export function calculateOccurrences(
	medication: MedicationDocument,
	from: Date,
	to: Date
): MedicationOccurrence[] {
	const schedule = medication.content.medication?.schedule;
	if (!schedule?.startDate) return [];
	const occurrences: MedicationOccurrence[] = [];
	const startDate = new Date(schedule.startDate);
	const endDate = schedule.endDate ? new Date(schedule.endDate) : to;

	// Clamp range
	const rangeStart = from > startDate ? from : startDate;
	const rangeEnd = to < endDate ? to : endDate;

	if (rangeStart > rangeEnd) return occurrences;

	const times = schedule.times.length > 0 ? schedule.times : ['08:00'];

	switch (schedule.frequency) {
		case 'once':
			addOccurrencesForDate(medication, startDate, times, rangeStart, rangeEnd, occurrences);
			break;
		case 'daily':
			for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
				addOccurrencesForDate(medication, new Date(d), times, rangeStart, rangeEnd, occurrences);
			}
			break;
		case 'weekly':
			handleWeeklyOccurrences(medication, schedule, times, rangeStart, rangeEnd, occurrences);
			break;
		case 'monthly':
			handleMonthlyOccurrences(medication, schedule, times, rangeStart, rangeEnd, occurrences);
			break;
		case 'as_needed':
			// No scheduled occurrences for as-needed medications
			break;
	}

	// Check adherence status for each occurrence
	const confirmations = medication.content.medication.adherence?.confirmations ?? [];
	resolveAdherenceStatus(occurrences, confirmations);

	return occurrences.sort((a, b) => {
		const dateCompare = a.scheduledDate.localeCompare(b.scheduledDate);
		return dateCompare !== 0 ? dateCompare : a.scheduledTime.localeCompare(b.scheduledTime);
	});
}

function addOccurrencesForDate(
	medication: MedicationDocument,
	date: Date,
	times: string[],
	rangeStart: Date,
	rangeEnd: Date,
	occurrences: MedicationOccurrence[]
) {
	const dateStr = toDateString(date);
	for (const time of times) {
		const [hours, minutes] = time.split(':').map(Number);
		const occDate = new Date(
			date.getFullYear(),
			date.getMonth(),
			date.getDate(),
			hours,
			minutes
		);
		if (occDate >= rangeStart && occDate <= rangeEnd) {
			occurrences.push({
				medicationId: medication.id,
				medicationName: medication.content.medication.medicationName,
				dosage: medication.content.medication.dosage,
				form: medication.content.medication.form,
				scheduledTime: time,
				scheduledDate: dateStr,
				status: 'pending'
			});
		}
	}
}

function handleWeeklyOccurrences(
	medication: MedicationDocument,
	schedule: MedicationSchedule,
	times: string[],
	rangeStart: Date,
	rangeEnd: Date,
	occurrences: MedicationOccurrence[]
) {
	const dayMap: Record<string, number> = {
		SU: 0,
		MO: 1,
		TU: 2,
		WE: 3,
		TH: 4,
		FR: 5,
		SA: 6
	};
	const activeDays = schedule.byDay?.map((d) => dayMap[d]) ?? [rangeStart.getDay()];

	for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
		if (activeDays.includes(d.getDay())) {
			addOccurrencesForDate(medication, new Date(d), times, rangeStart, rangeEnd, occurrences);
		}
	}
}

function handleMonthlyOccurrences(
	medication: MedicationDocument,
	schedule: MedicationSchedule,
	times: string[],
	rangeStart: Date,
	rangeEnd: Date,
	occurrences: MedicationOccurrence[]
) {
	const monthDays = schedule.byMonthDay ?? [new Date(schedule.startDate).getDate()];

	for (
		let d = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
		d <= rangeEnd;
		d.setMonth(d.getMonth() + 1)
	) {
		for (const day of monthDays) {
			const eventDate = new Date(d.getFullYear(), d.getMonth(), day);
			if (eventDate >= rangeStart && eventDate <= rangeEnd) {
				addOccurrencesForDate(medication, eventDate, times, rangeStart, rangeEnd, occurrences);
			}
		}
	}
}

function resolveAdherenceStatus(
	occurrences: MedicationOccurrence[],
	confirmations: AdherenceRecord[]
) {
	const now = new Date();
	for (const occ of occurrences) {
		const confirmation = confirmations.find(
			(c) => c.date === occ.scheduledDate && c.scheduledTime === occ.scheduledTime
		);
		if (confirmation) {
			occ.status = confirmation.status;
			occ.takenAt = confirmation.takenAt;
		} else {
			// If the scheduled time has passed and no confirmation, it's still pending
			const [h, m] = occ.scheduledTime.split(':').map(Number);
			const scheduledDateTime = new Date(occ.scheduledDate);
			scheduledDateTime.setHours(h, m, 0, 0);
			occ.status = scheduledDateTime < now ? 'pending' : 'pending';
		}
	}
}

function toDateString(date: Date): string {
	return date.toISOString().split('T')[0];
}

/**
 * Calculate all occurrences for multiple medications.
 */
export function calculateAllOccurrences(
	medications: MedicationDocument[],
	from: Date,
	to: Date
): MedicationOccurrence[] {
	return medications
		.filter((m) => m.content.status === 'active')
		.flatMap((m) => calculateOccurrences(m, from, to))
		.sort((a, b) => {
			const dateCompare = a.scheduledDate.localeCompare(b.scheduledDate);
			return dateCompare !== 0 ? dateCompare : a.scheduledTime.localeCompare(b.scheduledTime);
		});
}
