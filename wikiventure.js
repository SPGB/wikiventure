/*
* Wikiventure
* a crowd-funded choose your own adventure
* @AUTHOR SPGB
* @CONTRIBUTERS -
* @NOTES all choices should be edittable by almost anyone, all changes transparent
*/
var express = require('express')
  , routes = require('./routes')
  , http = require('http')
  , path = require('path')
  , bcrypt = require('bcrypt')
  , SALT_WORK_FACTOR = 10
  , crypto = require('crypto')
  , assert = require('assert');
 
var MongoStore  = require('connect-mongo')(express);
var mongoose = require('mongoose');
var db = mongoose.connection;

require('/config.js');

mongoose.connect('mongodb://' + session_conf.db.host + ':' + session_conf.db.port + '/' + session_conf.db.db, { auto_reconnect: true, user: session_conf.db.username, pass: session_conf.db.password }, function(err) {
    if (err) throw err;
    console.log('Successfully connected to MongoDB');
});

/*
* SCHEMA THINGS
* settings up our messgae (scene), revision, item, and user objects
*/
var messageSchema = new mongoose.Schema({
	text: { type: String, },
	last_message: { type: [String], required: true },
	action: { type: [String], required: true },
	room: { type: Number, default: 0 }, 
	updated_at: { type: Date },
	views: { type: Number, default: 0 },
	ip: { type: String }
});
messageSchema.pre('save', function(next) {
	this.updated_at = new Date;
	next();
});
var Message = mongoose.model('Message', messageSchema);

var revisionSchema = new mongoose.Schema({
	message_id: { type: String, required: true },
	text: { type: String, required: true },
	last_message: { type: [String], required: true },
	action: { type: [String], required: true },
	created_at: { type: Date },
	ip: { type: String }
});
revisionSchema.pre('save', function(next) {
	if (!this.created_at) this.created_at = new Date;
	next();
});
var Revision = mongoose.model('Revision', revisionSchema);
 
var itemSchema = new mongoose.Schema({
	name: { type: String, required: true },
	text: { type: String },
	from_scene: { type: [String], required: true },
	action: { type: [String] },
	ip: { type: String }
});
var Item = mongoose.model('Item', itemSchema);


var userSchema = new mongoose.Schema({
	name: { type: String, required: true , index: {unique: true}},
	level: { type: Number, default: 0 },
	password: { type: String },
	created_at: { type: Date },
	updated_at: { type: Date },
	ip: { type: String }
});
userSchema.pre('save', function(next) {
    var user = this;
	user.updated_at = new Date;
	if ( !user.created_at ) {
		user.created_at = new Date;
	}
	// only hash the password if it has been modified (or is new)
	if (!user.isModified('password')) return next();

	// generate a salt
	bcrypt.genSalt(SALT_WORK_FACTOR, function(err, salt) {
		if (err) return next(err);

		// hash the password using our new salt
		bcrypt.hash(user.password, salt, function(err, hash) {
			if (err) return next(err);

			// override the cleartext password with the hashed one
			user.password = hash;
			next();
		});
	});
});
userSchema.methods.comparePassword = function(candidatePassword, cb) {
    bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
        if (err) return cb(err);
        cb(null, isMatch);
    });
};
var User = mongoose.model('User', userSchema);

var app = express();
// all environments
app.set('port', 25352);
app.use(express.compress());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 31557600000 }));
app.use(express.logger('dev'));
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser());
app.use(express.session({ 
	secret: session_conf.secret, 
	cookie: { maxAge: 360000000000 },
	store: new MongoStore(session_conf.db)
}));
app.use(app.router);

/*
* ROUTES - general
*/
app.get('/', function (req, res) {
	if (req.session.last && req.session.last instanceof Array && req.session.last.length > 0) { //has already started
		var scenes = req.session.last;
		//var query_scenes = (scenes.length > 1)? [scenes[scenes.length - 1], scenes[scenes.length - 2]] : [scenes[scenes.length - 1]];
		Message.find({ _id: {$in: scenes} }, function (err, msgs) {
			//var changes = [];
			for (var i = 0; i < msgs.length; i++) {
				if (scenes[i] != msgs[i]._id) {
					var x = 0;
					var id = msgs[i]._id;
					for (var  j = 0; j < scenes.length; j++) {
						if (scenes[j] == id) { x = j; break; }
					}
					//changes.push('swapping ' + x + '(' + msgs[i]._id + ') and ' + i);
					msgs[i] = msgs.splice(x, 1, msgs[i])[0];
				}
			}
			//return res.json({c: changes, m: msgs, s: scenes });
			if (err || !msgs) return res.send('error! ' + err); 
			Message.find({
				_id: { $nin: scenes },
				$or:[ {'last_message':msgs[msgs.length - 1]._id}, { $and: [{'last_message':'*'}, {'room': msgs[msgs.length - 1].room}, {'action': {$ne:'begin'} }] } ],
				action: /^(?!examine).*$/i
			}, function (err, suggest_msgs) {
				var s = [];
				for (var i = 0; i < suggest_msgs.length; i++) {
					var m = suggest_msgs[i];
					for (var j = 0; j < m.action.length; j++) {
						if (j > 0) {
							s.push(m.action[j]);
						} else {
							s.unshift(m.action[j]);
						}
					}
					s.push('begin');
				}
				res.render('index', { 
					msgs: msgs,
					scenes: scenes, 
					suggestions: s, 
					items: req.session.items, 
					current_user: req.session.user
				});
			});	
		});
	} else {
		res.render('index', { 
			msgs: [{
				text: '<h1 style="font-size: 30px; position: static; padding: 0;"><span>Wiki</span>venture</h1>an open choose-your-own-adventure. You can take any action, edit any result. Be your own adventurer. \n \n Type "begin" at the bottom to get started.\n \n Only the top five suggestions will show up, Explore and choose your own path by typing in the box at the bottom', 
				room: 0
			}], 
			suggestions: ['begin'], 
			current_user: req.session.user
		});
	}
});
app.post('/do', function (req, res) {
	var a = new String(req.body.action).toLowerCase();
	var room = (req.body.room)? parseInt(req.body.room) : 0;
	var scenes = (req.body.scenes && req.body.scenes.length > 0)? req.body.scenes.split(',') : [];
	if (a.length < 2) return res.send('{}');
	if (a == 'begin') { room = 0; req.session.items = []; }
	Message.findOne({
		$and: [
			{'action':a},
			{ $or:[ { $and: [{'last_message':'*'}, {'room': room}] }, {'last_message':scenes[scenes.length - 1]} ] }
		]
	}, function (err, msg) {
		if (err) return res.send(err);
		if (!msg) {
			var new_msg = new Message({
				text: '',
				action: a,
				last_message: scenes[scenes.length - 1],
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
app.get('/restart', function (req, res) {
	req.session.last = [];
	req.session.items = [];
	res.redirect('/');
});
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
/*
* ROUTES - items
*/
app.get('/items', function (req, res) {
	Item.find({ }).exec(function (err, i) {
		res.render('item/view', {items: i, current_user: req.session.user});
	});
});
app.get('/item/new', function (req, res) {
	res.render('item/create');
});
app.post('/item/new', function (req, res) {
	new_item = new Item(req.body);
	new_item.save(function (err, i) {
		if (err) return res.render('item/create', { alert: err });
		res.redirect('/items');
	});
});
app.get('/item/:id', function (req, res) {
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
app.post('/item/:id', function (req, res) {
	try {
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
	} catch (err) { res.send('err: ' + err); }
});
/*
* ROUTES - users
*/
app.get('/login', function (req, res) {
	res.render('user/login', {current_user: req.session.user});
});
app.get('/logout', function (req, res) {
	req.session.user = null;
	req.session.user_level = null;
	res.redirect('login');
});
app.get('/user/new', function (req, res) {
	res.render('user/new', {current_user: req.session.user});
});
app.post('/user/new', function (req, res) {
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
app.get('/user/:id', function (req, res) {
	var ip = req.params.id.replace(/_/g, '.');
	User.findOne({ 
		$or:[ {'ip':ip}, {'name':req.params.id} ]
	}).exec(function (err, u) {
		Revision.find({ip:ip}, function (err, revs) {
			res.render('user/edit', {user: u, revs: revs, current_user: req.session.user});
		});
	});
});
app.get('/promote/:user', function (req, res) {
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
app.get('/users', function (req, res) {
	User.find({ }).exec(function (err, u) {
		res.render('user/view', {users: u, current_user: req.session.user});
	});
});
/*
* ROUTES - misc
*/
app.get('/revisions', function (req, res) {
	Revision.find({ }, function (err, revs) {
			res.render('revisions', {revs: revs});
	});
});
app.get('*', function (req, res) {
	res.render('index', { msgs: [{text:'404! File not found'}] });
});

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));

});