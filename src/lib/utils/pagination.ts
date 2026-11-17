/** Page-range helper for pagination, including ellipsis gaps. */
export function buildPageRange(
  page: number,
  pageCount: number,
  siblings = 1,
): Array<number | "ellipsis"> {
  const total = Math.max(1, pageCount);
  const left = Math.max(2, page - siblings);
  const right = Math.min(total - 1, page + siblings);
  const pages: Array<number | "ellipsis"> = [1];
  if (left > 2) pages.push("ellipsis");
  for (let index = left; index <= right; index += 1) pages.push(index);
  if (right < total - 1) pages.push("ellipsis");
  if (total > 1) pages.push(total);
  return pages.filter(
    (value, index, list) => value !== "ellipsis" || list[index - 1] !== "ellipsis",
  );
}
