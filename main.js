/* jshint esversion: 6 */
/* global CodeMirror, bibtexTidy */
CodeMirror.defineSimpleMode('simplemode', { // bibtex syntax highlighting
	start: [
		{ regex: /.*@comment/i, token: 'comment', push: 'comment' },
		{ regex: /(\s*)(@preamble)(\s*{)/i, token: [null, 'variable-2'], push: 'braced' },
		{ regex: /(\s*)(@preamble)(\s*\()/i, token: [null, 'variable-2'], push: 'parenthesised' },
		{ regex: /(\s*)(@string)(\s*{)/i, token: [null, 'variable-2'], push: 'braced' },
		{ regex: /(\s*)(@string)(\s*\()/i, token: [null, 'variable-2'], push: 'parenthesised' },
		{ regex: /(\s*)(@\w+)(\s*\{\s*)(\w+)(\s*,)/, token: [null, 'variable-2', null, 'variable-3'], push: 'entry' },
		{ regex: /.*/, token: 'comment' },
	],
	entry: [
		{ regex: /(\w+)(\s*)(=)/, token: ['keyword', null, 'operator']},
		{ regex: /"(?:[^\\]|\\.)*?(?:"|$)/, token: 'string' },
		{ regex: /\d+/i, token: 'number' },
		{ regex: /\{/, push: 'braced' },
		{ regex: /}/, pop: true },
	],
	braced: [
		{ regex: /\{/, push: 'braced' },
		{ regex: /[^{}]+/, token: 'string' },
		{ regex: /\}/, pop: true },
	],
	parenthesised: [
		{ regex: /\{/, token: 'comment', push: 'braced' },
		{ regex: /[^{)]+/, token: 'string' },
		{ regex: /\)/, pop: true },
	],
	comment: [
		{regex: /.*\}/, token: 'comment', pop: true},
		{regex: /.*/, token: 'comment'}
	],
});

const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);

for (let $suboption of $$('.suboptions')) {
	let $check = $suboption.parentNode.querySelector('input'),
		toggle = () => $suboption.style.display = $check.checked ? 'block' : 'none';
	$check.addEventListener('change', toggle);
	toggle();
	$('input[name=indent]').addEventListener('change', toggle); // hack
}

let options = document.forms.options,
	cmEditor = CodeMirror.fromTextArea($('#editor textarea'), { lineNumbers: true, autofocus: true }),
	errorHighlight;

for (let $label of $$('label[data-option]')) {
	let option = bibtexTidy.options[$label.dataset.option];
	$label.setAttribute('title', option.description);
	$label.querySelector('.name').textContent = option.name;
}

$('#tidy').addEventListener('click', () => {
	$('#tidy').setAttribute('disabled', true);
	$('#feedback').style.display = 'none';
	$('#feedback').innerHTML = '';
	document.body.classList.toggle('error', false);
	if (errorHighlight) {
		errorHighlight.clear();
	}
	let bibtex = cmEditor.getValue(),
		result,
		opt = {
			curly: options.curly.checked,
			numeric: options.numeric.checked,
			sort: options.sort.checked && options.sortkeys.value.split(/[\n\t ,]+/),
			omit: options.omit.checked && options.omitkeys.value.split(/[\n\t ,]+/),
			space: Number(options.spaces.value),
			tab: options.indent.value === 'tabs',
			align: options.enablealign.checked ? Number(options.align.value) : 0,
			merge: options.merge.checked,
			stripEnclosingBraces: options.strip.checked,
			dropAllCaps: options.dropcaps.checked,
			sortProperties: options.sortp.checked && options.sortpkeys.value.split(/[\n\t ,]+/),
			stripComments: options.stripcomments.checked
		};
	setTimeout(() => {
		try {
			result = bibtexTidy.tidy(bibtex, opt);
			cmEditor.setValue(result.bibtex);
			
			$('#feedback').innerHTML += `<strong>Successful!</strong><br>Tidied ${result.entries.length} entries.<br><br>`;

			if (opt.merge) {
				$('#feedback').innerHTML += `<strong>${result.duplicates.length} merged${result.duplicates.length > 0 ? ':' : ''}</strong><br>`;
				if (result.duplicates.length > 0) {
					$('#feedback').innerHTML += '<ul>' + result.duplicates.map(dupe => `<li>${dupe.entry.id} merged into ${dupe.duplicateOf.id}</li>`).join('') + '</ul>';
				}
			}
			let lists = [
				['proceedings', result.proceedings],
				['publishers', result.publishers],
				['journals', result.journals]
			];
			for (let [key, counts] of lists) {
				let link = document.createElement('a');
				link.classList.add('listlink');
				link.innerHTML = `${Object.keys(counts).length} unique ${key}`;
				link.href = 'javascript:;';
				link.addEventListener('click', () => {
					$('#dlg').style.display = 'block';
					$('#dlgcontent').innerHTML = `
						<strong>${Object.keys(counts).length} unique ${key}:</strong>
						<ul>
							${Object.keys(counts)
									.sort()
									.map(name => `<li>${name} (${counts[name]} entries)</li>`)
									.join('')}
						</ul>`;
				});
				$('#feedback').appendChild(link);
			}

		} catch (e) {
			console.error('bibtex parse problem:', e);
			document.body.classList.toggle('error', true);
			$('#feedback').innerHTML = `<strong>There's a problem with the bibtex (${e.name})</strong><br>
			Line ${e.location.start.line} column ${e.location.start.column}<br>
			${e.message}`;
			let from = { line: e.location.start.line - 1, ch: e.location.start.column - 1 },
				to = { line: e.location.end.line - 1, ch: e.location.end.column + 9 };
			errorHighlight = cmEditor.markText(from, to, { css: 'background: #de3040; color: white; font-weight: bold' });
		}
		$('#feedback').style.display = 'block';
		$('#tidy').removeAttribute('disabled');
	}, 100);
});

$('#dlgclose').addEventListener('click', () => $('#dlg').style.display = 'none');
$('#dlg').addEventListener('click', () => $('#dlg').style.display = 'none');
$('#dlginner').addEventListener('click', e => e.stopPropagation());