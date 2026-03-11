export function isEmpty(obj: unknown): boolean {
    return JSON.stringify(obj) == '{}';
}