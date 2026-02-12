import { getHealthDocument } from './signals';
import { updateDocument } from '$lib/documents';
import { profiles, updateProfile } from '$lib/profiles';
import { type Profile } from '$lib/types.d';
import { type Document } from '$lib/documents/types.d';
import definitions from './definitions.json';
import { log } from '$lib/logging/logger';

// Create health namespace logger
const healthLogger = log.namespace('Health', '🏥');

/**
 * Field categories based on definitions.json
 */
const STATIC_FIELDS = ['birthDate', 'biologicalSex', 'bloodType', 'smokingStatus', 'alcoholConsumption', 'physicalActivity', 'diet'];
const ARRAY_FIELDS = ['vaccinations', 'allergies', 'chronicConditions'];
const TIME_SERIES_FIELDS = ['weight', 'height', 'bloodPressure', 'heartRate', 'temperature', 'oxygenSaturation', 'bloodSugar'];

/**
 * Get the unit for a time-series field from definitions
 */
function getFieldUnit(fieldKey: string): string {
  const def = definitions.find((d: any) => d.key === fieldKey);
  if (!def || def.type !== 'time-series') return '';

  // For simple time-series (single value), get unit from the value item
  const valueItem = def.items?.find((item: any) => item.key === fieldKey || item.key !== 'date');
  return valueItem?.unit || '';
}

/**
 * Get items definition for a time-series field
 */
function getFieldItems(fieldKey: string): { key: string; type: string; unit?: string }[] {
  const def = definitions.find((d: any) => d.key === fieldKey);
  if (!def || def.type !== 'time-series') return [];
  return def.items || [];
}

/**
 * Check if a time-series value is compound (has multiple value fields like bloodPressure)
 */
function isCompoundTimeSeries(fieldKey: string): boolean {
  const items = getFieldItems(fieldKey);
  // Compound if more than 2 items (date + multiple values)
  const valueItems = items.filter((item: any) => item.key !== 'date');
  return valueItems.length > 1;
}

interface SaveHealthProfileOptions {
  profileId: string;
  formData: Record<string, any>;
}

interface SaveHealthProfileResult {
  success: boolean;
  error?: string;
}

/**
 * Save health profile data to the health document
 *
 * Data categories:
 * - Static: birthDate, biologicalSex, bloodType, smokingStatus, alcoholConsumption, physicalActivity, diet
 * - Arrays: vaccinations, allergies, chronicConditions
 * - Time-series: weight, height, bloodPressure, heartRate, temperature, oxygenSaturation, bloodSugar
 */
export async function saveHealthProfile(options: SaveHealthProfileOptions): Promise<SaveHealthProfileResult> {
  const { profileId, formData } = options;

  if (!profileId || !formData) {
    return { success: false, error: 'Missing profileId or formData' };
  }

  try {
    // Get the health document
    const document = await getHealthDocument(profileId);
    if (!document) {
      return { success: false, error: 'Health document not found' };
    }

    // Initialize signals if needed (document.content should always exist from getHealthDocument)
    if (!document.content.signals) {
      document.content.signals = {};
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    // Process static fields
    for (const field of STATIC_FIELDS) {
      if (formData[field] !== undefined) {
        document.content[field] = formData[field];
      }
    }

    // Process array fields (merge with existing)
    for (const field of ARRAY_FIELDS) {
      if (formData[field] !== undefined && Array.isArray(formData[field])) {
        // Replace with form data (form is source of truth for arrays)
        document.content[field] = formData[field];
      }
    }

    // Process time-series fields
    for (const field of TIME_SERIES_FIELDS) {
      const value = formData[field];

      // Skip if no value or empty
      if (value === undefined || value === null || value === '') continue;

      // Initialize signal structure if needed
      if (!document.content.signals[field]) {
        document.content.signals[field] = {
          log: 'full',
          history: [],
          values: []
        };
      }

      // Check if this is a compound field (like bloodPressure with systolic/diastolic)
      if (isCompoundTimeSeries(field)) {
        // For compound fields, value should be an object with subfields
        if (typeof value === 'object' && !Array.isArray(value)) {
          // Check if any subfield has a value
          const items = getFieldItems(field).filter((item: any) => item.key !== 'date');
          const hasValue = items.some((item: any) => {
            const subValue = value[item.key];
            return subValue !== undefined && subValue !== null && subValue !== '';
          });

          if (hasValue) {
            const unit = items[0]?.unit || '';
            const signalEntry = {
              signal: field,
              value: value,
              unit: unit,
              date: today,
              source: 'input',
              refId: ''
            };

            // Add to values array, sorted by date (newest first)
            document.content.signals[field].values = [
              signalEntry,
              ...document.content.signals[field].values
            ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          }
        }
      } else {
        // Simple time-series (single value)
        // value can be the raw number or an object with the field key
        let numericValue: number | undefined;

        if (typeof value === 'number') {
          numericValue = value;
        } else if (typeof value === 'object' && value[field] !== undefined) {
          numericValue = Number(value[field]);
        } else if (typeof value === 'string') {
          numericValue = Number(value);
        }

        if (numericValue !== undefined && !isNaN(numericValue)) {
          const unit = getFieldUnit(field);
          const signalEntry = {
            signal: field,
            value: numericValue,
            unit: unit,
            date: today,
            source: 'input',
            refId: ''
          };

          // Add to values array, sorted by date (newest first)
          document.content.signals[field].values = [
            signalEntry,
            ...document.content.signals[field].values
          ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }
      }
    }

    // Update the document
    await updateDocument(document);

    // Update the profile in the store
    const profile = await profiles.get(profileId) as Profile;
    if (profile) {
      // Update profile health data from document content
      profile.health = {
        ...profile.health,
        ...document.content
      };
      updateProfile(profile);
    }

    healthLogger.info('Health profile saved successfully', { profileId });
    return { success: true };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    healthLogger.error('Failed to save health profile', { profileId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}
