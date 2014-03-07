module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    uglify: {
      options: {
        banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n',
      },
      build: {
        src: 'src/main.js',
        dest: 'public/js/main.min.js'
      }
    },
	jshint: {
	  // define the files to lint
	  files: ['src/*.js'],
	  // configure JSHint (documented at http://www.jshint.com/docs/)
	  options: {
		  // more options here if you want to override JSHint defaults
		"curly": true,
		"eqnull": true,
		"eqeqeq": true,
		"undef": true,
		globals: {
		  $: true,
		  document: true,
		  window: true,
		  console: true,
		  module: true,
		  setTimeout: true
		}
	  }
	}
  });

  // Load the plugin that provides the "uglify" task.
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-jshint');

  // Default task(s).
  grunt.registerTask('default', ['jshint', 'uglify']);

};