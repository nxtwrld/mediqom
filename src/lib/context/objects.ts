import objects from "$data/objects.json";
import { getAllKeys } from "$data/signal-catalog";

const anatomy: string[] = Object.keys(objects)
  .reduce((acc, key) => {
    return [...acc, ...(objects as Record<string, any>)[key].objects];
  }, [] as string[])
  .map((obj) => obj.toLowerCase());

const labKeys: string[] = getAllKeys().map((k) => k.toLowerCase());

let allObjects = [...anatomy, ...labKeys];

export default objects;

export function isObject(id: string, type: string | undefined = undefined) {
  const str = id.toLowerCase();
  switch (type) {
    case "lab":
      return labKeys.includes(str);
    case "anatomy":
      return anatomy.includes(str);
    default:
      return allObjects.includes(str);
  }
}

export function findObjects(
  text: string,
  type: string | undefined = undefined,
) {
  const lText = text.toLowerCase().replace(/ /gi, "_");

  switch (type) {
    case "lab":
      return labKeys.filter((obj) => lText.includes(obj));
    case "anatomy":
      return anatomy.filter((obj) => lText.includes(obj));
    default:
      return allObjects.filter((obj) => lText.includes(obj));
  }
}
