/*
* ROUTES - items
*/

module.exports = (function() {
    var router = require('express').Router();
	var mongoose = require('mongoose');

	Item = mongoose.model('Item');
	Revision = mongoose.model('Revision');
	Message = mongoose.model('Message');

	router.get('/all', function (req, res) {
		Item.find({ }).exec(function (err, i) {
			res.render('item/view', {items: i, current_user: req.session.user});
		});
	});
	router.get('/new', function (req, res) {
		res.render('item/create');
	});
	router.post('/new', function (req, res) {
		new_item = new Item(req.body);
		new_item.save(function (err, i) {
			if (err) return res.render('item/create', { alert: err });
			res.redirect('/items');
		});
	});
	router.get('/:id', function (req, res) {
		Item.findOne({_id: req.params.id}, function (err, item) {
			if (err) return res.send(err);
			if (!item) return res.send('could not find');
			Revision.find({message_id: item._id }, function (err, revs) {
				Message.find({ _id: item.from_scene }, function (err, msgs) {
					res.render('item/edit', { item: item, revs: revs, msgs: msgs, current_user: req.session.user });
				});
			});
		});
	});
	router.post('/:id', function (req, res) {
		Item.findOne({_id: req.params.id}, function (err, item) {
			if (err) return res.send(err);
			if (!item) return res.send('could not find');
			item.name = req.body.name;
			item.text = req.body.text;
			item.from_scene = req.body.from_scene.split(',');
			item.action = req.body.action.split(',');
			for (var i = 0; i < item.action.length; i++) { item.action[i] = item.action[i].trim(); }
			for (var i = 0; i < item.from_scene.length; i++) { item.from_scene[i] = item.from_scene[i].trim(); }
			item.save(function (err, item) {
				if (err) return res.render('item/edit', { item: item, alert: err });
				new_rev = new Revision({
					last_message: item.from_scene,
					action: item.action,
					text: item.text,
					message_id: item._id,
					ip: (req.session.user)? req.session.user : req.headers['x-forwarded-for']
				});
				new_rev.save(function (err, rev) {
					if (err) return res.render('item/edit', { item: item, alert: 'error adding new revision' + err });
					Revision.find({message_id: item._id }, function (err, revs) {
						Message.find({ _id: item.from_scene }, function (err, msgs) {
							res.render('item/edit', { item: item, revs: revs, msgs: msgs, alert: 'saved!' });
						});
					});
				});
				
			});
		});
	});
	return router;
})();