var scenes;
var inventory;
var room;
var max_scenes_len = 20;
var suggestions;
var last_action;
var cached_offset = 0;
$(document).ready(function () {
	update_inventory();
	format_scene();
	show_suggestions('');
	if ($('.alert').length > 0 && $('.alert').text().length < 15) {
			setTimeout(function () {
				$('.alert').fadeOut(1000, function () { $(this).remove(); });
			}, 3000);
	}
	$('body').on('mouseover', '.inventory_item:not(.empty)', function () {
		$('.tooltip').hide();
		var id = $(this).attr('x-id');
		if ($('.tooltip#' + id).length > 0) {
			$('.tooltip#' + id).show();
		} else {
			for (var i = 0; i < inventory.length; i++) {
				var item = inventory[i];
				if (typeof item === 'object' && item._id === id) {
					var div = $('<div />', { html: '<b>' + item.name + '</b><br />' + item.text + '<div class="triangle_right"></div>', class: 'tooltip', id: item._id});
					$(this).append(div);
					return;
				}
			}
		}
	});
	$('body').on('click', 'tr[x-href]', function () {
		window.location = $(this).attr('x-href');
        return false;
	});
	$('body').on('click', '.suggestion_box span', function () {
		$('#your_action').val($(this).text());
		$('#your_action').closest('form').submit();
	});
	$('body').on('keyup keydown', '#your_action', function (e) {
		if (e.keyCode >= 37 && e.keyCode <= 40 ) { return; }
		if (e.keyCode === 13 && $('.suggestion_box span.active').length > 0) {
			$('input#your_action').val($('.suggestion_box span.active').text());
		}
		show_suggestions($.trim($('#your_action').val()));
	});
	$(document).keydown(function(e){
		if (e.keyCode === 39 || e.keyCode === 40 ) {	
			$('.suggestion_box span.active').removeClass('active').next().addClass('active');
			if ($('.suggestion_box span.active').length === 0) {
				$('.suggestion_box span:first').addClass('active');
			}
			return false;
		}
		if (e.keyCode === 37 || e.keyCode === 38 ) { 
			$('.suggestion_box span.active').removeClass('active').prev().addClass('active');
			if ($('.suggestion_box span.active').length === 0) {
				$('.suggestion_box span:last').addClass('active');
			}
			return false;
		}
	});
	$('body').on('change', '.auto_update select, .auto_update input', function () {
		$(this).closest('form').submit();
	});
	$('body').on('click', '.alert', function () {
		$('.alert').fadeOut(1000, function () { $(this).remove(); });
	});
	$('input#your_action').val('').focus();
	
	//tooltip
	$('body').on('mouseover', 'span[x-name]', function (e) {
		$('.tooltip:visible').hide();
		if ($('.tooltip#examine_' + $(this).attr('x-name')).length > 0) {
			$('.tooltip#examine_' + $(this).attr('x-name')).show();
			return true;
		}
		var div = $('<div />', { text: 'examining', class: 'tooltip examining', id: 'examine_' + $(this).attr('x-name') });
		$(this).append(div);
		var current_scene = ($(this).parent('span').attr('id') === 'current_scene')? scenes[scenes.length - 1] : scenes[scenes.length - 2];
		$.ajax({
			url: 'scene',
			data: {
				action: 'examine ' + $(this).attr('x-name'),
				scenes: current_scene,
			},
			dataType: 'JSON',
			type: 'POST',
			success: function (j) {
				if (j.new_scene) {
					$('.tooltip:visible').html('<b>No one has examined this before.</b><br>What do you think you would see?' +
					'<form action="scene/' + j.new_msg._id + '" method="POST">' +
					'<input type=hidden name="action" value="' + j.new_msg.action[0] + '">' +
					'<input type=hidden name="room" value="' + room + '">' +
					'<input type=hidden name="last_message" value="' + scenes[scenes.length - 1] + '">' +
					'<textarea value="text" name="text" placeholder="text"></textarea><div class="form_submit"><input type="submit" value="add it" /></div></form>');
					$('h2 textarea').focus();
					return;
				}
				if (j._id) {
					$('.tooltip.examining').html(j.text.split("\n").join("<br>") + '<a style="" id="edit" href="scene/' + j._id + '">edit</a>').removeClass('examining');
				}
			},
			error: function (j) {
				var span = $('.tooltip.examining').parent();
				$('.tooltip.examining').remove();
				$(span).trigger('mouseover');
			}
		});
	});
	$('body').on('click', '.suggestion_right', function (e) {
		cached_offset -= 250;	
		$('.suggestion_box span:first').animate({'margin-left':cached_offset}, 250, 'linear');
	});
	$('body').on('click', '.suggestion_left', function (e) {
		cached_offset += 250;
		if (cached_offset > 0) {
			cached_offset = 0;
		}
		$('.suggestion_box span:first').animate({'margin-left':cached_offset}, 250, 'linear');
	});
	$('body').on('click', '#go_back', function (e) { 
		$('#new_scene').remove();
		$('h2 #current_scene').show();
		return false;
	});
	$('body').on('mouseout', 'span[x-name]', function (e) { 
		$('.tooltip:visible').hide();
	});
	$('form[action="do"]').submit(function () {
		$('.alert').remove();
		last_action = format_input( $('input#your_action').val() );
		
		if (last_action.length < 2 || (scenes.length === 0 && last_action !== 'begin')) {
			$('input#your_action').css('border-top', '2px solid red');
			setTimeout(function () {
				$('input#your_action').css('border-top', '1px solid #ddd');
			}, 3000);
			$('input#your_action').val('').focus();
			return false;
		}
		if (last_action === 'begin') {
			scenes = [];
			inventory = [];
			update_inventory();
			$('#current_scene, #previous_scene').text('');
		}
		
		$.ajax({
			url: 'scene',
			data: {
				action: last_action,
				scenes: scenes.join(","),
				room: room,
				update: true
			},
			dataType: 'JSON',
			type: 'POST',
			success: function (j) {
				$('.suggestion_box').text('');
				$('input#your_action').val('').focus();
				cached_offset = 0;
				if (j.new_scene) {
					$('h2 #current_scene').hide().after('<span id="new_scene"><b>No one has done this before!</b><br />' +
					'Help make wikiventure amazing by adding to it!<br />Describe what happens when you <i>"' + j.new_msg.action[0] + '"</i>' +
					'<form action="scene/' + j.new_msg._id + '" method="POST">' +
					'<input type=hidden name="action" placeholder="action" value="' + j.new_msg.action[0] + '">' +
					'<input type=hidden name="last_message" placeholder="action" value="' + scenes[scenes.length - 1] + '">' +
					'<textarea value="text" name="text" placeholder="text"></textarea><div class="form_submit"><a href="/" id="go_back">back</a><input type="submit" value="add it" /></div></form></span>');
					$('h2 textarea').focus();
				}
				if (j.room) { room = j.room; }
				if (j._id) { //success
					scenes.push(j._id);
					suggestions = j.suggestions;
					if (scenes.length > max_scenes_len) {
						$('body').append('<div class="alert">Wikiventure is just beginning. you have reached the furthest point currently in the game. <br /> type "begin" to start again</div>');
						scenes = [];
					}
					if (j.text) {
						$('#current_scene a').remove();
						$('#previous_scene').append('<p>' + $('#current_scene').html() + '</p>');
						if (j._id) $('#current_scene').html(j.text.split("\n").join("<br>") + '<a id="edit" style="" href="scene/' + j._id + '">edit</a>');
						if (j.items.length > 0) {
							add_item(j.items[0]);
							$('#current_scene').prepend('<img src="img/' + j.items[0].name.replace(/\s+/g, '') + '.svg" class="size_medium" />');
						}
					} else {
						$('#current_scene').html('<i>no text :(<br>Please improve Wikiventure and add some.</i>' + 
						'<form action="scene/' + j._id + '" method="POST">' +
						'<input type=text name="action" placeholder="action" value="' + last_action + '"><br />' +
						'<textarea value="text" name="text" placeholder="text"></textarea><br /><input type="submit" value="add it" /></form>');
					}
				} else {
					suggestions = [];
				}
				format_scene();
				show_suggestions('');
			},
			error: function () {
				setTimeout(function () {
					$('form[action="do"]').submit();
				}, 2000);
			}
		});
		return false;
	});
	function format_input(input) {
		var input_split = input.toLowerCase().split(' ');
		var len = input_split.length;
		var unneeded_words =  ['the', 'a'];
		for (var i = 0; i < len; i++) {
			if ($.inArray(input_split[i], unneeded_words) !== -1) { input_split.splice(i, 1); }
		}
		return input_split.join(' ');
	}
	function format_scene() {
		if ($('#current_scene').length === 0) { return; }
		var spaced_scene = ($('.text_container h2').html()).split(' ');
		for (var i = 0; i < spaced_scene.length; i++) {
			if (spaced_scene[i][0] === '!') {
				var append = '';
				if (spaced_scene[i].indexOf('.') > 0) {
					spaced_scene[i] = spaced_scene[i].replace('.', '');
					append = '.';
				}
				spaced_scene[i] = '<span x-name="' + spaced_scene[i].substr(1) + '">' + spaced_scene[i].substr(1) + '</span>' + append;
			}
		}
		$('.text_container h2').html(spaced_scene.join(' '));
		window.scroll(0,document.body.scrollHeight);
	}
	function add_item(item) {
		inventory.push(item);
		$('.inventory_item.empty:first').html('<img src="img/' + item.name.replace(/\s+/g, '') + '.svg" />').removeClass('empty').attr('x-id', item._id);
	}
	function update_inventory() {
		$('.inventory_item:not(.empty)').addClass('empty').html('');
		for (var i = 0; i < inventory.length; i++) {
			var item = inventory[i];
			if (typeof item === 'object' && item._id) {
				$('.inventory_item.empty:first').html('<img src="img/' + item.name.replace(/\s+/g, '') + '.svg" />').removeClass('empty').attr('x-id', item._id);
			}
		}
	}
	function show_suggestions(val) {
		$('.suggestion_box').text('');
		var suggestion_count = 0;
		for (var i = 0; i < suggestions.length; i++) {
			if (suggestions[i].indexOf(val) !== -1 && (val !== '' || suggestions[i] !== 'begin')) {
				$('.suggestion_box').append('<span>' +suggestions[i].replace(val, '<b>' + val + '</b>') + '</span>');
				suggestion_count++;
			}
		}
		if (suggestion_count === 1) {
			$('.suggestion_box span').addClass('active');
		}
	}
});