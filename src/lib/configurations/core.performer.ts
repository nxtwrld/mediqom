/**
 * Core Performer Schema with Multi-Language Support
 *
 * Uses predefined role enums that can be easily translated via translation files.
 * Role keys map to translation keys like: performer.role.primary_physician
 */
export default {
  type: "object",
  description:
    "Medical professional or healthcare provider information with standardized roles for multi-language support",
  properties: {
    role: {
      type: "string",
      enum: [
        // Primary roles
        "primary_physician",
        "attending_physician",
        "resident_physician",
        "fellow",
        "nurse_practitioner",
        "physician_assistant",

        // Specialist roles
        "cardiologist",
        "cardiologist_interventional",
        "cardiologist_electrophysiology",
        "pathologist",
        "pathologist_molecular",
        "pathologist_forensic",
        "radiologist",
        "radiologist_interventional",
        "oncologist",
        "oncologist_medical",
        "oncologist_radiation",
        "oncologist_surgical",
        "surgeon",
        "surgeon_cardiac",
        "surgeon_orthopedic",
        "surgeon_plastic",
        "anesthesiologist",
        "emergency_physician",
        "psychiatrist",
        "neurologist",
        "dermatologist",
        "urologist",
        "gynecologist",
        "pediatrician",
        "geriatrician",
        "rheumatologist",
        "endocrinologist",
        "gastroenterologist",
        "pulmonologist",
        "nephrologist",
        "hematologist",
        "infectologist",
        "geneticist",

        // Technical roles
        "echo_technician",
        "ultrasound_technician",
        "radiology_technician",
        "lab_technician",
        "phlebotomist",
        "pharmacist",
        "pharmacy_technician",

        // Administrative/Support roles
        "care_coordinator",
        "case_manager",
        "social_worker",
        "nutritionist",
        "physical_therapist",
        "occupational_therapist",
        "respiratory_therapist",

        // Other
        "consultant",
        "second_opinion",
        "medical_student",
        "other_specialist",
      ],
      description:
        "Role of the medical professional (translation key: performer.role.{value})",
    },
    name: {
      type: "string",
      description: "Full name of the medical professional",
    },
    title: {
      type: "string",
      description: "Professional title (Dr., Prof., etc.)",
    },
    specialty: {
      type: "string",
      description: "Medical specialty or subspecialty",
    },
    licenseNumber: {
      type: "string",
      description: "Medical license or registration number",
    },
    institution: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of healthcare institution",
        },
        department: {
          type: "string",
          description: "Department or service",
        },
        address: {
          type: "string",
          description: "Institution address",
        },
        phone: {
          type: "string",
          description: "Contact phone number",
        },
        email: {
          type: "string",
          description: "Contact email address",
        },
      },
    },
    signature: {
      type: "string",
      description: "Digital or scanned signature if present",
    },
    datePerformed: {
      type: "string",
      description: "Date when this performer's role was executed (ISO format)",
    },
    isPrimary: {
      type: "boolean",
      description: "Is this the primary performer for the document?",
    },
  },
  required: ["role", "name"],
};
