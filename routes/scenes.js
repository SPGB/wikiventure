/*
* ROUTES - scenes
*/
app.get('/scenes', function (req, res) {
	var room = req.param('room', null);
	var text = req.param('text', null);
	var triggers = req.param('triggers', null);
	var sort = req.param('sort', null);
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
app.get('/scene/delete/:id', function (req, res) {
	if (req.session.user_level != 1) return res.send('i cant let you do that dave');
	Message.findOne({_id: req.params.id}, function (err, msg) {
		Revision.find({message_id: msg._id }, function (err, revs) {
			for (var i = 0; i < revs.length; i++) {
				revs[i].remove();
			}
			res.redirect('scenes');
		});
		msg.remove();
	});
});
app.get('/scene/:id', function (req, res) {
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
app.post('/scene/:id', function (req, res) {
	try {
	Message.findOne({_id: req.params.id}, function (err, msg) {
		if (err) return res.send(err);
		if (!msg) return res.send('could not find');
		if (!req.body.last_message) req.body.last_message = '*';
		msg.text = req.body.text;
		if (req.body.room) msg.room = req.body.room;
		msg.last_message = req.body.last_message.split(',');
		msg.action = req.body.action.split(',');
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
	} catch (err) { res.send('err: ' + err); }
});
app.post('/scene/new', function (req, res) {
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