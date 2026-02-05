import * as cheerio from "cheerio";

type TableParseOptions = {
  selector?: string;
};

/**
 * Normalize text by trimming and collapsing whitespace.
 */
export const cleanText = (text: string): string =>
  text.replace(/\s+/g, " ").trim();

/**
 * Parse a simple HTML table into objects keyed by header text.
 */
export const parseTable = (
  html: string,
  options: TableParseOptions = {}
): Array<Record<string, string>> => {
  const $ = cheerio.load(html);
  const table = options.selector ? $(options.selector) : $("table").first();
  const headers: string[] = [];

  table.find("thead tr th").each((_, element) => {
    headers.push(cleanText($(element).text()));
  });

  const rows: Array<Record<string, string>> = [];
  table.find("tbody tr").each((_, row) => {
    const record: Record<string, string> = {};
    $(row)
      .find("td")
      .each((index, cell) => {
        const key = headers[index] ?? `col_${index}`;
        record[key] = cleanText($(cell).text());
      });
    rows.push(record);
  });

  return rows;
};

/**
 * Parse list items from a selector.
 */
export const parseList = (html: string, selector: string): string[] => {
  const $ = cheerio.load(html);
  return $(selector)
    .map((_, el) => cleanText($(el).text()))
    .get();
};
