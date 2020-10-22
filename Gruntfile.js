/*eslint
camelcase: ["error", {"properties": "never"}]
*/
var testConfig = require('./build/test/config');

module.exports = function(grunt) {
	'use strict';

	grunt.loadNpmTasks('grunt-babel');
	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-contrib-concat');
	grunt.loadNpmTasks('grunt-contrib-connect');
	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-contrib-watch');
	grunt.loadNpmTasks('grunt-parallel');
	grunt.loadNpmTasks('grunt-run');
	grunt.loadTasks('build/tasks');

	var langs;
	if (grunt.option('lang')) {
		langs = (grunt.option('lang') || '').split(/[,;]/g).map(function(lang) {
			lang = lang.trim();
			return lang !== 'en' ? '.' + lang : '';
		});
	} else if (grunt.option('all-lang')) {
		var localeFiles = require('fs').readdirSync('./locales');
		langs = localeFiles.map(function(file) {
			return '.' + file.replace('.json', '');
		});
		langs.unshift(''); // Add default
	} else {
		langs = [''];
	}

	var webDriverTestBrowsers = ['firefox', 'chrome', 'ie', 'safari'];

	process.env.NODE_NO_HTTP2 = 1; // to hide node warning - (node:18740) ExperimentalWarning: The http2 module is an experimental API.

	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		parallel: {
			'browser-test': {
				options: {
					stream: true,
					grunt: true
				},
				tasks: webDriverTestBrowsers.map(function(b) {
					return 'test-webdriver:' + b;
				})
			}
		},
		'test-webdriver': (function() {
			var tests = testConfig(grunt);
			var options = Object.assign({}, tests.unit.options);
			options.urls = options.urls.concat(tests.integration.options.urls);
			var driverTests = {};
			webDriverTestBrowsers.forEach(function(browser) {
				driverTests[browser] = {
					options: Object.assign(
						{
							browser: browser
						},
						options
					)
				};
			});
			return driverTests;
		})(),
		clean: ['dist', 'tmp', 'axe.js', 'axe.*.js'],
		babel: {
			options: {
				compact: false
			},
			core: {
				files: [
					{
						expand: true,
						cwd: 'lib/core',
						src: ['index.js'],
						dest: 'tmp/core'
					}
				]
			},
			misc: {
				files: [
					{
						expand: true,
						cwd: 'tmp',
						src: ['**/*.js'],
						dest: 'tmp'
					}
				]
			}
		},
		'update-help': {
			options: {
				version: '<%=pkg.version%>'
			},
			rules: {
				src: ['lib/rules/**/*.json']
			}
		},
		concat: {
			engine: {
				options: {
					process: true
				},
				coreFiles: ['tmp/core/index.js', 'tmp/core/**/*.js'],
				files: langs.map(function(lang, i) {
					return {
						src: [
							'lib/intro.stub',
							'<%= concat.engine.coreFiles %>',
							// include rules / checks / commons
							'<%= configure.rules.files[' + i + '].dest.auto %>',
							'lib/outro.stub'
						],
						dest: 'axe' + lang + '.js'
					};
				})
			}
		},
		esbuild: {
			core: {
				files: [
					{
						expand: true,
						cwd: 'lib/core',
						src: ['core.js'],
						dest: 'tmp/core'
					}
				]
			}
		},
		'aria-supported': {
			data: {
				entry: 'lib/commons/aria/index.js',
				destFile: 'doc/aria-supported.md',
				listType: 'unsupported' // Possible values for listType: 'supported', 'unsupported', 'all'
			}
		},
		configure: {
			rules: {
				tmp: 'tmp/rules.js',
				options: {
					tags: grunt.option('tags')
				},
				files: langs.map(function(lang) {
					return {
						src: [''],
						dest: {
							auto: 'tmp/rules' + lang + '.js',
							descriptions: 'doc/rule-descriptions' + lang + '.md'
						}
					};
				})
			}
		},
		'add-locale': {
			newLang: {
				options: {
					lang: grunt.option('lang')
				},
				src: ['tmp/core/core.js'],
				dest: './locales/' + (grunt.option('lang') || 'new-locale') + '.json'
			}
		},
		langs: {
			generate: {
				check: 'lib/commons/utils/valid-langs'
			}
		},
		validate: {
			check: {
				options: {
					type: 'check'
				},
				src: 'lib/checks/**/*.json'
			},
			rule: {
				options: {
					type: 'rule'
				},
				src: 'lib/rules/**/*.json'
			}
		},
		uglify: {
			beautify: {
				files: langs.map(function(lang, i) {
					return {
						src: ['<%= concat.engine.files[' + i + '].dest %>'],
						dest: '<%= concat.engine.files[' + i + '].dest %>'
					};
				}),
				options: {
					mangle: false,
					compress: false,
					beautify: {
						beautify: true,
						ascii_only: true,
						indent_level: 2,
						braces: true,
						quote_style: 1
					},
					output: {
						comments: /^\/*! axe/
					}
				}
			},
			minify: {
				files: langs.map(function(lang, i) {
					return {
						src: ['<%= concat.engine.files[' + i + '].dest %>'],
						dest: './axe' + lang + '.min.js'
					};
				}),
				options: {
					output: {
						comments: /^\/*! axe/
					},
					mangle: {
						reserved: ['commons', 'utils', 'axe', 'window', 'document']
					}
				}
			}
		},
		'file-exists': {
			data: langs.reduce(function(out, lang) {
				out.push('axe' + lang + '.js');
				out.push('axe' + lang + '.min.js');
				return out;
			}, [])
		},
		watch: {
			files: [
				'lib/**/*',
				'test/**/*.js',
				'test/integration/**/!(index).{html,json}',
				'Gruntfile.js'
			],
			tasks: ['build', 'testconfig', 'fixture', 'notify']
		},
		testconfig: {
			test: {
				src: ['test/integration/rules/**/*.json'],
				dest: 'tmp/integration-tests.js'
			}
		},
		fixture: {
			engine: {
				src: ['<%= concat.engine.coreFiles %>'],
				dest: 'test/core/index.html',
				options: {
					fixture: 'test/runner.tmpl',
					testCwd: 'test/core',
					data: {
						title: 'Axe Core Tests'
					}
				}
			},
			checks: {
				src: [
					'<%= concat.engine.files[0].dest %>',
					'build/test/engine.js',
					'<%= configure.rules.tmp %>'
				],
				dest: 'test/checks/index.html',
				options: {
					fixture: 'test/runner.tmpl',
					testCwd: 'test/checks',
					data: {
						title: 'Axe Check Tests'
					}
				}
			},
			commons: {
				src: [
					'<%= concat.engine.files[0].dest %>',
					'build/test/engine.js',
					'<%= configure.rules.tmp %>'
				],
				dest: 'test/commons/index.html',
				options: {
					fixture: 'test/runner.tmpl',
					testCwd: 'test/commons',
					data: {
						title: 'Axe Commons Tests'
					}
				}
			},
			ruleMatches: {
				src: [
					'<%= concat.engine.files[0].dest %>',
					'build/test/engine.js',
					'<%= configure.rules.tmp %>'
				],
				dest: 'test/rule-matches/index.html',
				options: {
					fixture: 'test/runner.tmpl',
					testCwd: 'test/rule-matches',
					data: {
						title: 'Axe Rule Matches Tests'
					}
				}
			},
			integration: {
				src: ['<%= concat.engine.files[0].dest %>'],
				dest: 'test/integration/rules/index.html',
				options: {
					fixture: 'test/runner.tmpl',
					testCwd: 'test/integration/rules',
					tests: ['../../../tmp/integration-tests.js', 'runner.js'],
					data: {
						title: 'Axe Integration Tests'
					}
				}
			}
		},
		connect: {
			test: {
				options: {
					hostname: '0.0.0.0',
					port: grunt.option('port') || 9876,
					base: ['.']
				}
			}
		},
		run: {
			npm_run_testHeadless: {
				cmd: 'npm',
				args: ['run', 'test:headless']
			}
		},
		notify: {
			data: {
				title: 'Axe-core',
				message: 'Build complete',
				sound: 'Pop',
				timeout: 2
			}
		}
	});

	grunt.registerTask('translate', ['validate', 'esbuild', 'add-locale']);
	grunt.registerTask('build', [
		'clean',
		'validate',
		'esbuild',
		'configure',
		'babel',
		'concat:engine',
		'uglify',
		'aria-supported'
	]);
	grunt.registerTask('prepare', [
		'build',
		'file-exists',
		'testconfig',
		'fixture',
		'connect'
	]);
	grunt.registerTask('default', ['build']);
	grunt.registerTask('dev', ['prepare', 'watch']);
	grunt.registerTask('test-fast', ['prepare', 'run:npm_run_testHeadless']);
	grunt.registerTask('test', [
		'prepare',
		'run:npm_run_testHeadless',
		'parallel'
	]);
	grunt.registerTask('ci-build', ['prepare', 'parallel']);
};
