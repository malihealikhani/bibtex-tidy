/* jshint node: true, esversion: 6, unused: true */
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import dsv from '@rollup/plugin-dsv';

const tsv = {
	processRow(row) {
		return [row.unicode, row.latex];
	}
};

export default {
	input: 'src/index.js',
	plugins: [dsv(tsv), commonjs(), nodeResolve()],
	output: {
		name: 'bibtexTidy',
		file: 'bibtex-tidy.js',
		format: 'umd'
	}
};