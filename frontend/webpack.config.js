const path = require('path');
const { VueLoaderPlugin } = require('vue-loader');
const HTMLWebpackPlugin = require('html-webpack-plugin');

module.exports = {
	target: 'browserslist',
	entry: './frontend.ts',
	mode: 'production',
	devtool: false,
	output: {
		filename: 'bundle.js',
		path: path.resolve(__dirname, 'dist'),
	},
	optimization: {
		usedExports: true,
	},
	resolve: {
		extensions: ['.js', '.ts', '.tsx', '.vue', '.json'],
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				loader: 'ts-loader',
				exclude: /node_modules/,
				options: { appendTsSuffixTo: [/\.vue$/] },
			},
			{
				test: /\.m?js$/,
				exclude: /(node_modules|bower_components)/,
				use: {
					loader: 'babel-loader',
					options: {
						presets: ['@babel/preset-env'],
					},
				},
			},
			{
				test: /\.vue$/,
				loader: 'vue-loader',
			},
			{
				test: /\.css$/,
				use: ['vue-style-loader', 'css-loader'],
			},
		],
	},
	plugins: [
		new VueLoaderPlugin(),
		new HTMLWebpackPlugin({
			showErrors: true,
			cache: true,
			template: path.resolve(__dirname, 'index.html'),
		}),
	],
};
