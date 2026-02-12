import { prefixes, suffixes } from "./honorificTitles";
import type { DetectedProfileData } from "$lib/import";
import { profiles } from "./index";
import type { Profile } from "$lib/types.d";
import {
  capitalizeFirstLetters,
  removeNonAlpha,
  removeNonAlphanumeric,
  removeNonNumeric,
  searchOptimize,
} from "$lib/strings";
import type { DocumentNew } from "$lib/documents/types.d";
import user from "$lib/user";

export function normalizeName(
  name: string,
  options: {
    removeDiacritics?: boolean;
  } = {},
): string {
  const opt = Object.assign(
    {
      removeDiacritics: true,
    },
    options,
  );
  // Remove diacritics
  if (opt.removeDiacritics)
    name = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Convert to lowercase
  name = name.toLowerCase();

  // Trim whitespace
  name = name.trim();

  // Remove punctuation
  name = name.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");

  return removePrefixes(name);
}

export function removePrefixes(name: string): string {
  // Split name into words
  let words = name.split(/\s+/);

  // Remove prefixes
  while (words.length > 0 && prefixes.includes(words[0])) {
    words.shift();
  }

  // Remove suffixes
  while (words.length > 0 && suffixes.includes(words[words.length - 1])) {
    words.pop();
  }

  // Remove middle names (keep first and last names)
  if (words.length > 2) {
    words = [words[0], words[words.length - 1]];
  }
  //console.log('Remove prefixes', name, '=>', words.join(' '));
  // Return the normalized name
  return words.join(" ");
}

export function mergeNamesOnReports(reports: DocumentNew[]): {
  profile: Profile;
  reports: DocumentNew[];
}[] {
  // Create a map of unique patient names
  const patientMap = new Map<
    string,
    {
      profile: Profile;
      reports: DocumentNew[];
    }
  >();

  // Merge reports with the same patient name
  reports.forEach((report) => {
    if (report.content?.patient?.fullName) {
      const name = normalizeName(report.content.patient.fullName);

      if (patientMap.has(name)) {
        // merge the patient object with the same name to include any missing properties
        // carefull about the insurance subobject
        let profile = patientMap.get(name)!.profile;
        let newProfile = report.content.patient;
        console.log("newProfile", newProfile);
        if (newProfile.insurance && !profile.insurance) {
          profile.insurance = newProfile.insurance;
        }

        if (newProfile.birthDate && !profile.health.birthDate) {
          profile.health.birthDate = newProfile.birthDate;
        }
        if (
          newProfile.insurance &&
          newProfile.insurance.provider &&
          !profile.insurance.provider
        ) {
          profile.insurance.provider = newProfile.insurance.provider;
        }
        if (
          newProfile.insurance &&
          newProfile.insurance.number &&
          !profile.insurance.number
        ) {
          profile.insurance.number = newProfile.insurance.number;
        }

        patientMap.get(name)!.reports.push(report);

        // check profiles store for a match
        const foundInProfiles = findInProfiles(profile);
        if (foundInProfiles.length > 0) {
          profile = foundInProfiles[0];
        }

        patientMap.get(name)!.profile = profile;
      } else {
        let profile = Object.assign(getEmptyProfile(), {
          id: "NEW",
          //...report.content.patient,
          fullName: capitalizeFirstLetters(
            removePrefixes(report.content.patient.fullName),
          ),
          language: user.get()?.language || "en",
        });

        if (report?.content.patient.birthDate) {
          profile.health.birthDate = report.content.patient.birthDate;
        }
        if (report.content.patient.insurance) {
          if (report.content.patient.insurance.number) {
            profile.insurance.number = removeNonNumeric(
              report.content.patient.insurance.number,
            );
          }

          if (report.content.patient.insurance.provider) {
            profile.insurance.provider = capitalizeFirstLetters(
              report.content.patient.insurance.provider,
            );
          }
        }
        if (report.content.patient.identifier) {
          let insurance_number = removeNonNumeric(
            report.content.patient.identifier,
          );
          profile.insurance.number = insurance_number;
        }

        // check profiles store for a match
        const foundInProfiles = findInProfiles(profile);

        if (foundInProfiles.length > 0) {
          profile = foundInProfiles[0];
        }

        patientMap.set(name, {
          profile,
          reports: [report],
        });
      }
    } else {
      patientMap.set("unknown-" + Math.random(), {
        profile: {
          id: "unknown-" + Math.random(),
          fullName: "unknown",
          language: "en",
          vcard: null,
          health: null,
          insurance: null,
          publicKey: "",
          status: "unknown",
        },
        reports: [report],
      });
    }
  });

  const profilesInSet = Array.from(patientMap.values());

  // look for matching profiles in the profiles store

  // Return the merged reports
  return profilesInSet;
}

/**
 * Search for profiles with a given name and insurance number
 *
 * @param name Search for profiles with this name
 * @param insurance_number Search for profiles with this insurance number
 * @returns array of profiles
 */
export function findInProfiles(contact: {
  fullName?: string;
  insurance?: {
    number?: string;
    provider?: string;
  };
  biologicalSex?: string;
  birthDate?: string;
}): Profile[] {
  if (!contact.fullName && !contact.insurance?.number) return [];

  let name = contact.fullName ? normalizeName(contact.fullName) : "";
  let insurance_number = contact.insurance?.number;

  const profilesData = profiles.get();
  const profilesArray = (Array.isArray(profilesData) ? profilesData : [profilesData]) as Profile[];

  let names: string[] = [];
  let insurance_numbers: string[] = [];
  if (name) {
    name = name.trim();
    names.push(name);
    names.push(searchOptimize(name));
    if (name.indexOf(" ") > 0) {
      const lastName = name.split(" ").pop();
      if (lastName) {
        names.push(lastName);
        names.push(searchOptimize(lastName));
      }
    }
  }
  if (insurance_number) {
    insurance_numbers.push(removeNonNumeric(insurance_number));
    insurance_numbers.push(removeNonAlphanumeric(insurance_number));
    insurance_numbers.push(removeNonAlpha(insurance_number));
  }

  // remove empty string from names and insurance_numbers
  names = names.filter((n: string) => n && n.length > 0);
  insurance_numbers = insurance_numbers.filter((n: string) => n && n.length > 0);

  // search profiles based on names and insurance_numbers
  const profilesFound = profilesArray
    .map((p) => {
      let r = {
        profile: p,
        matchName: false,
        matchInsurance: false,
      };
      if (names.length > 0) {
        if (
          names.some((n: string) =>
            n && searchOptimize(normalizeName(p.fullName || "")).includes(n),
          )
        ) {
          r.matchName = true;
        }
      }
      if (insurance_numbers.length > 0) {
        if (
          insurance_numbers.some((n: string) => p.insurance && n === p.insurance.number)
        ) {
          r.matchInsurance = true;
        }
      }
      return r;
    })
    .filter((p) => p.matchName || p.matchInsurance)
    .sort((a, b) => {
      if (a.matchName && !b.matchName) return -1;
      if (!a.matchName && b.matchName) return 1;
      return 0;
    })
    .sort((a, b) => {
      if (a.matchInsurance && !b.matchInsurance) return -1;
      if (!a.matchInsurance && b.matchInsurance) return 1;
      return 0;
    })
    .sort((a, b) => {
      if (a.matchName && a.matchInsurance) return -1;
    });

  return profilesFound.map((p) => p.profile);
}

export function normalizePatientData(profile: DetectedProfileData): Profile {
  let result: Profile = getEmptyProfile();
  result.fullName = capitalizeFirstLetters(profile.fullName.trim());

  if (profile.health) {
    result.health = profile.health;
  }

  if (profile.birthDate) {
    if (!result.health) result.health = {};
    result.health.birthDate = profile.birthDate;
  }
  if (profile.insurance) {
    result.insurance = {};

    if (profile.insurance.number) {
      result.insurance.number = removeNonNumeric(profile.insurance.number);
    }

    if (profile.insurance.provider) {
      result.insurance.provider = capitalizeFirstLetters(
        profile.insurance.provider,
      );
    }
  }

  if (profile.identifier) {
    let insurance_number = removeNonNumeric(profile.identifier);
    if (result.insurance) result.insurance.number = insurance_number;
    else {
      result.insurance = {
        number: insurance_number,
      };
    }
  }
  return result;
}

export function excludePossibleDuplicatesInPatients(patients: any[]): any[] {
  return patients.filter((p, i) => {
    return (
      patients.findIndex((p2) => {
        return (
          searchOptimize(p2.fullName) === searchOptimize(p.fullName) &&
          p2.insurance.number === p.insurance.number
        );
      }) === i
    );
  });
}

export const PROFILE_NEW_ID = "NEW";
function getEmptyProfile(): Profile {
  return {
    ...{
      id: PROFILE_NEW_ID,
      fullName: "",
      health: {},
      insurance: {},
      vcard: {},
      publicKey: "",
      avatarUrl: "",
      status: "",
      language: user.get()?.language || "en",
    },
  };
}
