import objects from "$data/objects.json";
import labs from "$data/lab.synonyms.json";

const anatomy: string[] = Object.keys(objects)
  .reduce((acc, key) => {
    return [...acc, ...(objects as Record<string, any>)[key].objects];
  }, [] as string[])
  .map((obj) => obj.toLowerCase());

const labKeys: string[] = labs.map((lab) => lab[0].toLowerCase());

let allObjects = [...anatomy, ...labKeys];

export default objects;

export function isObject(id: string, type: string | undefined = undefined) {
  const str = id.toLowerCase(); //.replace(/ /ig, '_');
  //console.log('id', id);
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
