/*
* ROUTES - scenes
*/

module.exports = (function() {
    var router = require('express').Router();
	var mongoose = require('mongoose');

	Item = mongoose.model('Item');
	Revision = mongoose.model('Revision');
	Message = mongoose.model('Message');

	router.get('/', function (req, res) {
		res.redirect('/');
	});
	router.post('/', function (req, res) {
		var a = new String(req.body.action).toLowerCase();
		var room = (req.body.room)? parseInt(req.body.room) : 0;
		var scenes = (req.body.scenes && req.body.scenes.length > 0)? req.body.scenes.split(',') : [];
		if (a.length < 2) return res.send('{}');
		if (a == 'begin') { room = 0; req.session.items = []; }
		Message.findOne({
			$and: [
				{'action':a},
				{ is_active: true},
				{ $or:[ { $and: [{'last_message':'*'}, {'room': room}] }, {'last_message':scenes[scenes.length - 1]} ] }
			]
		}, function (err, msg) {
			if (err) return res.send(err);
			if (!msg) {
				var last_scene = scenes[scenes.length - 1];
				if (!last_scene) last_scene = '*';
				var new_msg = new Message({
					text: '',
					action: a,
					last_message: last_scene,
					room: room,
					ip: (req.session.user)? req.session.user : req.headers['x-forwarded-for']
				});
				new_msg.save(function (err, msg) {
					if (err) return res.send(err);
					return res.json({new_scene:true, new_msg: msg})
				});
			} else {
				if (scenes instanceof Array) scenes.push(msg._id);
				if (req.body.update) req.session.last = scenes;
				msg.views++;
				msg.save(function (err, msg) {
					Message.find({
						_id: { $nin: scenes },
						$or:[ {'last_message':msg._id}, { $and: [{'last_message':'*'}, {'room': room}, {'action': {$ne:'begin'}}] } ],
						action: /^(?!examine).*$/i
					}).sort('-views').exec(function (err, s_msgs) {
							var s = [];
							for (var i = 0; i < s_msgs.length; i++) {
								var m = s_msgs[i];
								for (var j = 0; j < m.action.length; j++) {
									if (j > 0) {
										s.push(m.action[j]);
									} else {
										s.unshift(m.action[j]);
									}
								}
							}
							s.push('begin');
							Item.find({ from_scene: msg._id }, function (err, items) {
								if (items.length > 0) {
									if (req.session.items instanceof Array) {
										var dup = false;
										for (var i = 0; i < req.session.items.length; i++) {
											if (req.session.items[i]._id == items[0]._id) {
												items = [];
												dup = true;
												break;
											}
										}
										if (!dup) req.session.items.push(items[0]);
									} else {
										req.session.items = items;
									}
								}
								res.json({
									_id: msg._id,
									text: msg.text,
									room: msg.room,
									suggestions: s,
									items: items
								});
							}); //end item callback
						}); //end suggestions callback
				}); //end message save callback
			}
		}); //end message callback
	});

	router.get('/all', function (req, res) {
		var room = req.query.room;
		var text = req.query.text;
		var triggers = req.param('triggers', null);
		var sort = req.query.sort;
		var query = {};
		if (room) query['room'] = room;
		if (text) query['text'] = {$regex: text};
		if (triggers) query['action'] = {$regex: triggers};
		var query_sort = (sort)? sort : 'action';
		Message.find(query).sort(query_sort).exec(function (err, msgs) {
			res.render('scenes', {
				msgs: msgs, 
				title: 'Scenes',
				current_user: req.session.user, 
				room: room, 
				text: text, 
				triggers: triggers, 
				sort: sort});
		});
	});
	router.get('/delete/:id', function (req, res) {
		Message.findOne({_id: req.params.id}, function (err, msg) {
			Revision.find({message_id: msg._id }, function (err, revs) {
				for (var i = 0; i < revs.length; i++) {
					revs[i].remove();
				}
				res.redirect('scenes');
			});
			msg.is_active = !msg.is_active;
			msg.save();
			res.redirect('/scene/all');
		});
	});
	router.get('/:id', function (req, res) {
		Message.findOne({_id: req.params.id}, function (err, msg) {
			if (err) return res.send(err);
			if (!msg) return res.send('could not find');
			Revision.find({message_id: msg._id }, function (err, revs) {
				Message.find({
					$or:[ {'last_message':msg._id}, {'last_message':'*'} ]
				}, function (err, future_msgs) {
					Message.find({
						'_id': {$in: msg.last_message}
					}, function (err, past_msgs) {
						res.render('edit', { title: 'Edit Scene', msg: msg, revs: revs, future_msgs: future_msgs, past_msgs: past_msgs, current_user: req.session.user });
					});
				});
			});
		});
	});
	router.post('/:id', function (req, res) {
		if (!req.body.text) { return res.send('Please enter some text'); }
		Message.findOne({_id: req.params.id}, function (err, msg) {
			if (err) return res.send(err);
			if (!msg) return res.send('could not find');
			if (!req.body.last_message) req.body.last_message = '*';
			msg.text = req.body.text;
			if (req.body.room) msg.room = req.body.room;
			msg.last_message = req.body.last_message.split(',');
			msg.action = (req.body.action)? req.body.action.split(',') : 'begin';
			for (var i = 0; i < msg.action.length; i++) { msg.action[i] = msg.action[i].trim().toLowerCase(); }
			for (var i = 0; i < msg.last_message.length; i++) { msg.last_message[i] = msg.last_message[i].trim(); }
			msg.save(function (err, msg) {
				if (err) return res.render('edit', { msg: msg, revs: revs, alert: err });
				new_rev = new Revision({
					last_message: msg.last_message,
					action: msg.action,
					text: msg.text,
					message_id: msg._id,
					ip: (req.session.user)? req.session.user : req.headers['x-forwarded-for']
				});
				new_rev.save(function (err, rev) {
					if (err) return res.render('edit', { msg: msg, alert: 'error adding new revision' + err });
					Revision.find({message_id: msg._id }, function (err, revs) {
						Message.find({
							$or:[ {'last_message':msg._id}, {'last_message':'*'} ]
						}, function (err, future_msgs) {
							Message.find({
								'_id': {$in: msg.last_message}
							}, function (err, past_msgs) {
								res.render('edit', { alert: 'saved', title: 'Edit Scene', msg: msg, revs: revs, future_msgs: future_msgs, past_msgs: past_msgs, current_user: req.session.user });
							});
						});
					});
				});
				
			});
		});
	});
	router.post('/new', function (req, res) {
		var new_msg = new Message(req.body);
		new_msg.action = req.body.action.split(',');
		for (var i = 0; i < new_msg.action.length; i++) { new_msg.action[i] = new_msg.action[i].trim().toLowerCase(); }
		new_msg.ip = (req.session.user)? req.session.user : req.headers['x-forwarded-for'];
		new_msg.save(function (err, msg) {
			if (err) return res.send(err);
			req.session.last.push(msg._id);
			res.redirect('/');
		});
	});
	return router;
})();