export function updateLanguage(
  schema: { [key: string]: any },
  language: string = "English",
) {
  return updateString(schema, "[LANGUAGE]", language);
  /*
    for (const key in schema) {
      if (schema[key] instanceof Object) {
        schema[key] = updateLanguage(schema[key], language);
      } else {
        if (key === 'description' && typeof schema[key] == 'string') {
          if (schema[key].includes('[LANGUAGE]')) {
            schema[key] = schema[key].replace(/\[LANGUAGE\]/ig,language);
          //  console.log('Updated', key, schema[key]);
          }
          
        }
      }
    }
    return schema;
    */
}

export function updateString(
  schema: { [key: string]: any },
  placeholder: string,
  value: string,
) {
  for (const key in schema) {
    if (schema[key] instanceof Object) {
      schema[key] = updateString(schema[key], placeholder, value);
    } else {
      if (key === "description" && typeof schema[key] == "string") {
        if (schema[key].includes(placeholder)) {
          schema[key] = schema[key].replaceAll(placeholder, value);
        }
      }
    }
  }
  return schema;
}
