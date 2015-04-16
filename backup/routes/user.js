/*
* ROUTES - users
*/

module.exports = (function() {
    var router = require('express').Router();
	var mongoose = require('mongoose');

	User = mongoose.model('User');
	Revision = mongoose.model('Revision');
	Message = mongoose.model('Message');

	router.get('/login', function (req, res) {
		res.render('user/login', {current_user: req.session.user});
	});
	router.get('/logout', function (req, res) {
		req.session.user = null;
		req.session.user_level = null;
		res.redirect('login');
	});
	router.get('/new', function (req, res) {
		res.render('user/new', {current_user: req.session.user});
	});
	router.post('/new', function (req, res) {
		try {
		User.findOne({name:req.body.name}, function (err, user) {
			if (!user) {
				var u = new User(req.body);
				u.ip = req.headers['x-forwarded-for'];
				u.save(function (err, u) {
					req.session.user = u.name;
					req.session.user_level = u.level;
					res.redirect('user/' + u.name);
				});
			} else {
				user.comparePassword(req.body.password, function(err, isMatch) {
					if (err) return res.send(err);
					if (isMatch) {
						user.ip = req.headers['x-forwarded-for'];
						user.save(function (err, u) {
							req.session.user = u.name;
							req.session.user_level = u.level;
							res.redirect('user/' + u.name);
						});
					} else {
						res.render('user/login', {alert: 'invalid password'});
					}
				});
			}
		});
		} catch(err) { res.send('err ' + err); }
	});
	router.get('/:id', function (req, res) {
		var ip = req.params.id.replace(/_/g, '.');
		User.findOne({ 
			$or:[ {'ip':ip}, {'name':req.params.id} ]
		}).exec(function (err, u) {
			Revision.find({ip:ip}, function (err, revs) {
				res.render('user/edit', {user: u, revs: revs, current_user: req.session.user});
			});
		});
	});
	router.get('/promote/:user', function (req, res) {
		User.findOne({ 
			'name': req.params.user
		}).exec(function (err, u) {
			if (err || !u) return res.send('err ' + err);
			u.level = 1;
			u.save(function (err, u) {
				res.send('promoted');
			});
		});
	});
	router.get('/all', function (req, res) {
		User.find({ }).exec(function (err, u) {
			res.render('user/view', {users: u, current_user: req.session.user});
		});
	});
	return router;
})();