/* jshint node: true, esversion: 6, unused: true */
'use strict';

//import parser from 'bibtex-parse';
import parser, {
	BibTeXItem,
	BibTeXEntryItem,
	Value
} from '/home/peter/projects/bibtex-parse/src/index';

import unicode from './unicode.tsv'; // source: https://raw.githubusercontent.com/pkgw/worklog-tools/master/unicode_to_latex.py

const DEFAULT_FIELD_ORDER = [
	'title',
	'shorttitle',
	'author',
	'year',
	'month',
	'day',
	'journal',
	'booktitle',
	'location',
	'on',
	'publisher',
	'address',
	'series',
	'volume',
	'number',
	'pages',
	'doi',
	'isbn',
	'issn',
	'url',
	'urldate',
	'copyright',
	'category',
	'note',
	'metadata'
];

const MONTHS = [
	'jan',
	'feb',
	'mar',
	'apr',
	'may',
	'jun',
	'jul',
	'aug',
	'sep',
	'oct',
	'nov',
	'dec'
];

interface Options {
	// Remove specified fields
	// Remove specified fields from bibliography entries.
	// @cliExample --omit=id,name
	omit?: string[];
	// Enclose values in curly braces
	// Enclose all property values in braces. Quoted values will be converted to braces.
	// default false
	curly?: boolean;
	// Use numeric values where possible
	// Strip quotes and braces from numeric/month values. For example, {1998} will become 1998. Very long numbers will be BigInts
	// default false
	numeric?: boolean;
	// Indent with spaces
	// Prefix all fields with the specified number of spaces (ignored if tab is set).
	//'--space=2 (default)', '--space=4']
	// default 2
	space?: number | boolean;
	// Indent with tabs
	// Prefix all fields with a tab.
	// default false
	tab?: boolean;
	// Align values
	// Insert whitespace between fields and values so that values are visually aligned.
	// cliExamples: ['--align=14 (default)', '--no-align'],
	// default 14
	align?: number | boolean;
	// Sort bibliography entries
	// Sort entries by specified fields.
	// cliExamples: [
	// 	'--sort (sort by id)',
	// 	'--sort=-year,name (sort year descending then name ascending)',
	// 	'--sort=name,year'
	// ],
	// default false
	sort?: string[] | boolean;

	// Merge duplicate entries',
	// Two entries are considered duplicates in the following cases: (a) their DOIs are identical, (b) their abstracts are identical, or (c) their authors and titles are both identical. The firstmost entry is kept and any extra properties from duplicate entries are incorporated.
	// default false
	merge?: boolean;

	// Strip double-braced values.
	// Where an entire value is enclosed in double braces, remove the extra braces. For example, convert {{Journal of Tea}} to {Journal of Tea}.',
	// default false
	stripEnclosingBraces?: boolean;
	// Drop all caps
	// Where values are all caps, make them title case. For example, convert {JOURNAL OF TEA} to {Journal of Tea}.',
	// default false,
	dropAllCaps?: boolean;
	// Escape special characters
	// Escape special characters, such as umlaut. This ensures correct typesetting with latex.
	// cliExamples: ['--escape (default)', '--no-escape'],
	// default true,
	escape?: boolean;
	// Sort fields
	// Sort the fields within entries. The default sort order is ${DEFAULT_FIELD_ORDER.join(
	// 		', '
	// 	)}. Alternatively you can specify space delimited properties.`,
	// 	cliExamples: ['--sort-fields=name,author'],
	// default: false,
	sortFields?: boolean | string[];
	// Remove comments - Remove all comments from the bibtex source.',
	// default: false,
	stripComments?: boolean;
	// Encode URLs - Replace invalid URL characters with percent encoded values.
	// default: false,
	encodeUrls?: boolean;
	// Tidy comments - Remove whitespace surrounding comments.',
	// default: true
	tidyComments?: boolean;
	// @deprecated Use sortFields
	sortProperties?: boolean | string[];
}

interface Output {
	bibtex: string;
	warnings: Warning[];
	entries: BibTeXEntryItem[];
}
type Datatype = 'braced' | 'quoted' | null;
interface Warning {
	code: 'DUPLICATE_ENTRY' | 'MISSING_KEY' | 'DUPLICATE_KEY';
	message: string;
	entry: BibTeXEntryItem;
	duplicateOf?: BibTeXEntryItem;
}

const DEFAULTS: Options = {
	tidyComments: true
};

const specialCharacters = new Map(unicode);

const escapeSpecialCharacters = (str: string): string => {
	let newstr = '';
	let escapeMode;
	for (let i = 0; i < str.length; i++) {
		if (escapeMode) {
			escapeMode = false;
			newstr += str[i];
			continue;
		}
		if (str[i] === '\\') {
			escapeMode = true;
			newstr += str[i];
			continue;
		}

		// iterate through each character and if it's a special char replace with latex code
		const c = str
			.charCodeAt(i)
			.toString(16)
			.padStart(4, '0');
		newstr += specialCharacters.get(c) || str[i];
	}
	return newstr;
};

const titleCase = (str: string): string =>
	str.replace(
		/\w\S*/g,
		txt => txt.charAt(0).toLocaleUpperCase() + txt.substr(1).toLocaleLowerCase()
	);

const stripWhitespace = (str: string): string =>
	String(str)
		.replace(/\W/g, '')
		.toLocaleLowerCase();

const get = (item: BibTeXEntryItem, name: string) => {
	const n = name.toLocaleUpperCase();
	return item.fields.find(f => f.name.toLocaleUpperCase() === name);
};

const getValue = (item, name: string): Value => get(item, name)?.value;

const renderValue = (
	value: Value,
	datatype: Datatype,
	forceBrace?: boolean
): string => {
	if (datatype === 'braced' || forceBrace) return `{${value}}`;
	if (datatype === 'quoted') return `"${value}"`;
	return String(value);
};

const tidy = (input, options?: Options): Output => {
	options = { ...DEFAULTS, ...options }; // make a copy of options with defaults

	const sort: string[] = [];
	let indent: string = '';
	const sortFields: string[] = [];
	const merge: boolean = options.merge;
	const align: number =
		options.align === true ? 14 : options.align === false ? 0 : options.align;
	const omit: Set<string> = new Set();
	const stripEnclosingBraces: boolean = options.stripEnclosingBraces;
	const dropAllCaps: boolean = options.dropAllCaps;
	const encodeUrls: boolean = options.encodeUrls;
	const curly: boolean = options.curly;
	const numeric: boolean = options.numeric;

	if (options.sort === true) {
		sort.push('key');
	} else if (options.sort) {
		sort.push(...options.sort);
	}
	if (options.space === true) {
		indent = '  ';
	} else if (options.space) {
		indent = ' '.repeat(options.space);
	} else if (options.tab) {
		indent = '\t';
	}

	if (options.sortProperties) {
		// legacy
		options.sortFields = options.sortProperties;
	}
	if (options.sortFields === true) {
		sortFields.push(...DEFAULT_FIELD_ORDER);
	} else if (options.sortFields) {
		sortFields.push(...options.sortFields);
	}
	if (options.omit instanceof Array) {
		options.omit.forEach(a => omit.add(a));
	}

	const items: BibTeXItem[] = parser.parse(input);
	const hashes = [];
	const keys = new Set();
	const warnings: Warning[] = [];
	let preceedingMeta = []; // comments, preambles, and strings which should be kept with an entry
	for (const item of items) {
		if (item.itemtype !== 'entry') {
			// if string, preamble, or comment, then use sort index of previous entry
			preceedingMeta.push(item);
			item.index = {}; // by default, take index of preceeding item
		} else {
			if (!item.key) {
				warnings.push({
					code: 'MISSING_KEY',
					message: `${item.key} does not have an entry key.`,
					entry: item
				});
			} else if (keys.has(item.key)) {
				warnings.push({
					code: 'DUPLICATE_KEY',
					message: `${item.key} is a duplicate entry key.`,
					entry: item
				});
			}
			keys.add(item.key);

			if (merge) {
				const hash = {
					entry: item,
					doi: get(item, 'doi') ? stripWhitespace(getValue(item, 'doi')) : null,
					abstract: get(item, 'abstract')
						? stripWhitespace(getValue(item, 'abstract')).slice(0, 100)
						: null,
					authorTitle:
						(get(item, 'author')
							? String(getValue(item, 'author')).match(
									/([^\s]+)\s*(,|and |et |$)/
							  )[1]
							: '') +
						':' + // surname (comes before comma or 'and')
						(stripWhitespace(getValue(item, 'title')) || '').slice(0, 50)
				};
				const duplicate = hashes.find(h => {
					return hash.doi
						? hash.doi === h.doi
						: hash.abstract
						? hash.abstract === h.abstract
						: hash.authorTitle === h.authorTitle;
				});
				if (duplicate) {
					warnings.push({
						code: 'DUPLICATE_ENTRY',
						message: `${item.key} appears to be a duplicate of ${duplicate.entry.key} and was removed.`,
						entry: item,
						duplicateOf: duplicate.entry
					});
					duplicate.entry.fields.push(...item.fields);
					item.duplicate = true;
				} else {
					hashes.push(hash);
				}
			}

			if (sort.length > 0) {
				item.index = {};
				for (let key of sort) {
					if (key.startsWith('-')) key = key.slice(1);
					// if no value, then use \ufff0 so entry will be last
					item.index[key] = String(
						item[key] || getValue(item, key) || '\ufff0'
					).toLowerCase();
				}
				for (let i in preceedingMeta) {
					preceedingMeta[i].index = item.index; // update comments above to this index
				}
				preceedingMeta = [];
			}
		}
	}

	if (sort.length > 0) {
		for (let i = sort.length - 1; i >= 0; i--) {
			let key = sort[i];
			const desc = key.startsWith('-');
			if (desc) key = key.slice(1);
			items.sort((a, b) => {
				return ((desc ? b : a).index[key] || '\ufff0').localeCompare(
					(desc ? a : b).index[key]
				);
			});
		}
	}

	let bibtex = '';

	for (const item of items) {
		if (item.duplicate) {
			continue;
		}
		if (item.itemtype === 'string') {
			bibtex += `@string{${item.name} = ${item.raw}}\n`; // keep strings as they were
		} else if (item.itemtype === 'preamble') {
			bibtex += `@preamble{${item.raw}}\n`; // keep preambles as they were
		} else if (item.itemtype === 'comment') {
			const comment = options.tidyComments
				? item.comment.trim()
				: item.comment.replace(/^[ \t]*\n|\n[ \t]*$/g, '');
			if (comment && !options.stripComments) {
				bibtex += `${comment}\n`;
			}
		} else {
			// entry
			let props = new Set();
			for (const { name } of item.fields) {
				const lname = name.toLocaleLowerCase();
				if (!omit.has(lname)) props.add(lname);
			}
			props = [...props];

			if (sortFields) {
				props.sort((a, b) => {
					const indexA = sortFields.indexOf(a);
					const indexB = sortFields.indexOf(b);
					if (indexA > -1 && indexB > -1) return indexA - indexB;
					if (indexA > -1) return -1;
					if (indexB > -1) return 1;
					return 0;
				});
			}
			props = props.map(k => {
				const v = get(item, k);
				let output: string;
				if (v.datatype === 'concatinate') {
					output = v.value
						.map(({ value, datatype }) => renderValue(value, datatype))
						.join(' # ');
				} else {
					let val = String(v.value)
						.replace(/\s*\n\s*/g, ' ')
						.trim(); // remove whitespace
					if (stripEnclosingBraces) {
						val = val.replace(/^\{([^{}]*)\}$/g, '$1');
					}
					if (dropAllCaps && val.match(/^[^a-z]+$/)) {
						val = titleCase(val);
					}
					if (k === 'url' && encodeUrls) {
						val = val.replace(/\\?_/g, '\\%5F'); // must happen before escape special characters
					}
					if (escape) {
						val = escapeSpecialCharacters(val);
					}
					if (k === 'pages') {
						val = val.replace(/(\d)\s*-\s*(\d)/g, '$1--$2'); // replace single dash with double dash in page range
					}
					output = renderValue(val, v.datatype, curly);
					if (numeric) {
						if (val.match(/^[1-9][0-9]*$/)) {
							output = val; // String(Number(val)).toLowerCase();
						} else if (
							k === 'month' &&
							MONTHS.includes(val.slice(0, 3).toLowerCase())
						) {
							output = val.slice(0, 3).toLowerCase();
						}
					}
				}
				return `${indent}${k.padEnd(align - 1)} = ${output}`;
			});

			bibtex += `@${item.type.toLowerCase()}{${
				item.key ? `${item.key},` : ''
			}\n${props.join(',\n')}\n}\n`;
		}
	}

	const entries: BibTeXEntryItem[] = items.filter(
		item => item.itemtype === 'entry'
	);

	return { bibtex, warnings, entries };
};

export default { tidy, options: OPTIONS };
