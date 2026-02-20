import type { Link, LinkType as LinkTypeEnum } from "./common.types.d";
import { LinkType } from "./common.types.d";
import type { Document } from "$lib/documents/types.d";

type Universal = Document;

// Placeholder store objects - TODO: implement proper stores
const focus = {
  get: async (_uid: string) => undefined as Universal | undefined,
};
const questions = {
  get: async (_uid: string) => undefined as Universal | undefined,
};
const contacts = {
  get: async (_uid: string) => undefined as Universal | undefined,
};
const reports = {
  get: async (_uid: string) => undefined as Universal | undefined,
};

export type Item = {
  type: LinkTypeEnum;
  data: Universal;
};

export async function getAllLinkedItems(
  item: Item,
  simple: boolean = true,
): Promise<Item[]> {
  const allItems: Item[] = [];
  /* 
    allItems.push(item);

    if (item.data?.links && Array.isArray(item.data?.links)) {
        for (const linkedItem of item.data.links) {
            const childItem = await getItem(linkedItem);
            if (childItem !== undefined) {
                allItems.push({
                    type: linkedItem.type,
                    data: childItem
                });
                allItems.push(...await getAllLinkedItems({type: linkedItem.type, data: childItem}));
            }
        }
    }

    const uids: string[] = [];
    const result: Item[] = [];
    allItems.forEach(i => {
        if (uids.includes(i.type +'-'+i.data?.uid)) {
            return;
        }
        uids.push(i.type +'-'+i.data.uid)
        result.push(i);
    });

    return result;*/
  return allItems;
}

export async function getItem(link: Link): Promise<Universal | undefined> {
  switch (link.type) {
    case LinkType.Focus:
      return await focus.get(link.uid);
    case LinkType.Question:
      return await questions.get(link.uid);
    case LinkType.Contact:
      return await contacts.get(link.uid);
    case LinkType.Report:
      return await reports.get(link.uid);
  }
  return undefined;
}
