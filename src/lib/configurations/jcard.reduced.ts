export default {
  title: "jCard",
  description:
    "This document defines the jCard data format for representing and exchanging a variety of information about an individual (e.g., formatted and structured name and delivery addresses, email address, multiple telephone numbers, photograph, logo, audio clips, etc.).",
  type: "object",
  properties: {
    adr: {
      optional: true,
      type: "array",
      items: {
        type: "object",
        description:
          "To specify the components of the delivery address for the jCard object.",
        properties: {
          "extended-address": {
            optional: true,
            type: ["string", "array"],
            items: { type: "string" },
            description:
              "The extended address (e.g. apartment or suite number).",
          },
          "street-address": {
            optional: true,
            type: ["string", "array"],
            items: { type: "string" },
            description: "The street address.",
          },
          locality: {
            optional: true,
            type: ["string", "array"],
            items: { type: "string" },
            description: "The locality (e.g., city).",
          },
          region: {
            optional: true,
            type: ["string", "array"],
            items: { type: "string" },
            description: "The region (e.g., state or province).",
          },
          "postal-code": {
            optional: true,
            type: ["string", "array"],
            items: { type: "string" },
            description: "The postal code.",
          },
          "country-name": {
            optional: true,
            type: ["string", "array"],
            items: { type: "string" },
            description: "The country name.",
          },
        },
      },
    },

    email: {
      optional: true,
      type: "array",
      description:
        "To specify the electronic mail address for communication with the object the jCard represents. Omit this field entirely if no email address is available.",
      items: {
        type: "object",
        properties: {
          value: {
            type: "string",
            description: "A single text value.",
            format: "email",
          },
        },
      },
    },

    fn: {
      type: "string",
      description:
        "To specify the formatted text corresponding to the name of the object the jCard represents.",
    },

    geo: {
      optional: true,
      type: "object",
      description:
        "To specify information related to the global positioning of the object the jCard represents.",
      properties: {
        longitude: {
          type: "number",
          description:
            "The longitude represents the location east and west of the prime meridian as a positive or negative real number, respectively.",
        },
        latitude: {
          type: "number",
          description:
            "The latitude represents the location north and south of the equator as a positive or negative real number, respectively.",
        },
        altitude: {
          optional: true,
          type: "number",
          status: "experimental",
          description: "In metres above sea level.",
        },
      },
    },

    n: {
      optional: true,
      type: "object",
      description:
        "To specify the components of the name of the object the jCard represents.",
      properties: {
        "family-name": {
          optional: true,
          type: "array",
          items: { type: "string" },
        },
        "given-name": {
          optional: true,
          type: "array",
          items: { type: "string" },
        },
        "additional-name": {
          optional: true,
          type: "array",
          items: { type: "string" },
        },
        "honorific-prefix": {
          optional: true,
          type: "array",
          items: { type: "string" },
        },
        "honorific-suffix": {
          optional: true,
          type: "array",
          items: { type: "string" },
        },
      },
    },

    org: {
      optional: true,
      type: "array",
      description:
        "To specify the organizational name and units associated with the jCard.",
      items: {
        type: "object",
        properties: {
          "organization-name": { type: "string" },
          "organization-unit": {
            type: "array",
            items: {
              description: "The unit name within the organization.",
              type: "string",
            },
          },
        },
      },
    },

    role: {
      optional: true,
      type: "array",
      items: {
        type: "string",
        description:
          "To specify information concerning the role, occupation, or business category of the object the jCard represents.",
      },
    },

    tel: {
      optional: true,
      type: "array",
      description:
        "To specify the telephone number for telephony communication with the object the jCard represents. Omit this field entirely if no phone number is available.",
      items: {
        type: "object",
        properties: {
          value: {
            type: "string",
            description:
              "A single phone-number value with internation prefix code. If no prefix is available, assume the number is in the same country as the address.",
            format: "phone",
          },
        },
      },
    },
    title: {
      optional: true,
      type: "array",
      items: {
        type: "string",
        description:
          "To specify the job title, functional position or function of the object the jCard represents.",
      },
    },

    url: {
      optional: true,
      type: "array",
      items: {
        type: "string",
        description:
          "To specify a uniform resource locator associated with the object that the jCard refers to.",
        format: "uri",
      },
    },
  },
  required: ["fn", "n", "org", "tel", "email", "adr", "role", "title"],
};
