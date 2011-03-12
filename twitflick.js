/*
  twitflick.js
  
==  Synopsis 
    Post status update to twitter including a shortened flickr photo URL
  
==  Project URL
    http://github.com/preynolds/twitflick

==  Usage
    ./twitflick.js
  
==  Dependencies
    node, express, redis, connect-redis, flickrnode (MODIFIED, SEE COMMENTS INLINE), node-oauth
  
==  Author
    Patrick Reynolds
    patrick@vunction.com
  
*/


// Module dependencies.
var express = require('express'),
  crypto = require("crypto"),
  sys = require("sys"),
  fs = require("fs"),
  url = require("url"),
  querystring = require("querystring"),
  path = require("path"),
  events = require("events"),
  redis = require("redis"),
  RedisStore = require('connect-redis');

// Redis instance (redis session store is separate)
var defaultDB = '1';
var db = redis.createClient();

db.on("error", function(err){
    console.log("Error " + err);
});

// Select our DB
db.on("connect", function(){
  db.select(defaultDB);
  db.get("dbname", function(err, reply){
    sys.puts('Selected db \''+ defaultDB + '\' named \'' + reply + '\'');
  });
});

// Twitter config
var OAuth= require('../node-oauth/lib/oauth').OAuth;
var oa= new OAuth("https://api.twitter.com/oauth/request_token",
  "https://api.twitter.com/oauth/access_token",
  "key",
  "secret",
  "1.0",
  null,
  "HMAC-SHA1");

// flickr config
var FlickrAPI = require('flickrnode/lib/flickr').FlickrAPI;
var flickr = new FlickrAPI('key', 'secret');

// Create server instance
var app = express.createServer();

// Cookies / sessions
app.use(express.bodyDecoder());

app.use(express.cookieDecoder());

// Populates:
//   - req.session
//   - req.sessionStore
//   - req.sessionID
//
// If no DB match for session stored in browser cookie, connect.session generates a new one. 14 day maxAge
app.use(express.session({ store: new RedisStore({'db':'1', maxAge: 1209600000}) }));

// Serve errors
app.error(function(err, req, res, next){
  res.send('404 Not Found<br><br>'+err,404);
});

// Custom routes
app.get('/welcome', function(req, res){
  db.mget(req.sessionID+':twitter:username', req.sessionID+':flickr:username', function(err, replies){
    var code = 0;
    if (replies[0] != null) code = code+5; // 5 == has twitter
    if (replies[1] != null) code = code+10; // 10 == has flickr ... 15 == has both
    var str = "{'code':"+code+",'flickr':'"+replies[1]+"','twitter':'"+replies[0]+"'}";
    res.send(str);
    console.dir(str);
  });
});

app.get('/getFlickrUsername', function(req, res){
  db.get(req.sessionID+':flickr:username', function(err, reply){
    res.send(reply);
  });
});

app.get('/getFlickrNSID', function(req, res){
  // Params
  if(typeof(url.parse(req.url).query) !== 'undefined'){
    var qs = url.parse(req.url).query;
  }
  getFlickrNSID(req, res, querystring.parse(qs).username);
});

app.get('/getFlickrPhotos', function(req, res){
  // Params
  if(typeof(url.parse(req.url).query) !== 'undefined'){
    var qs = url.parse(req.url).query;
  }
  getFlickrPhotos(req, res, querystring.parse(qs).username);
});

app.get('/getTwitterRequestToken', function(req, res){
  getTwitterRequestToken(req, res);
});

app.get('/setTwitterAuthSuccess', function(req, res){
  if(typeof(url.parse(req.url).query) !== 'undefined'){
    var qs = url.parse(req.url).query;
    console.dir(qs);
  }
  
  db.set(req.sessionID+':twitter:verifier', querystring.parse(qs).oauth_verifier, function(err, reply){
    //back from twitter auth, so lets redirect to app home
    exchangeToken(req, res);
    
    var to = setTimeout(function () {
      res.writeHead(302, {
        'Location': '/'
      });
      res.end();
      
    }, 3000);
  
  });
});

app.get('/getTwitterAccessToken', function(req, res){
  getTwitterAccessToken(req, res);
});

app.get('/setTwitterStatus', function(req, res){
  if(typeof(url.parse(req.url).query) !== 'undefined'){
    var qs = url.parse(req.url).query;
  }
  sys.puts('Going to tweet: ' + querystring.parse(qs).content);
  setTwitterStatus(req, res, querystring.parse(qs).content);
});

app.get('/getSession', function(req, res){
  var body = '<p>Session ID: ' + req.sessionID + '</p>';
  console.dir(req.sessionID);
  res.send(body);
});

// Catch everything else
app.get('*', function(req, res){
  if (req.url !== "/favicon.ico"){
    // Cookie/Session management
    console.log('Hit from: '+req.sessionID);
    // Add session entry to the active users set
    db.sadd('users',req.sessionID, function(err, reply){ });
  }
  
  // Serve stuff
  if (req.url == "/"){
    res.sendfile(__dirname + '/public_html/index.html');
  } else {
    res.sendfile(__dirname + '/public_html' + req.url);
  };
  
});

app.listen(3000);
console.log('TwitFlick started on port 3000');






var exchangeToken = function(req, res){
  db.mget(req.sessionID+':twitter:requestToken', 
    req.sessionID+':twitter:requestTokenSecret', 
    req.sessionID+':twitter:verifier', 
    function(err, replies){
      oa.getOAuthAccessToken(replies[0], replies[1], replies[2], function(error, oauth_access_token, oauth_access_token_secret, results2){
        if(error){
          sys.puts('error: ' + sys.inspect(error));
          
        }else{            
          sys.puts('accesstoken results: ' + sys.inspect(results2.screen_name));
          db.set(req.sessionID+':twitter:username', results2.screen_name, redis.print);
          db.set(req.sessionID+':twitter:accessToken', oauth_access_token, redis.print);
          db.set(req.sessionID+':twitter:accessTokenSecret', oauth_access_token_secret, redis.print);
        }
      });
    });
};

var getFlickrNSID = function(req, res, username){
  flickr.people.findByUsername(username, function(error, userinfo){
    if (error){
      res.send(error.message);
    }else {
      res.send(userinfo.nsid);
      db.set(req.sessionID+':flickr:username', username, redis.print);
      db.set(req.sessionID+':flickr:nsid', userinfo.nsid, redis.print);
    }
  });
};

// Get NSID for supplied username, and call the getPhotos function. Or return errors.
var getFlickrPhotos = function(req, res, username){
  db.mget(req.sessionID+':flickr:username', req.sessionID+':flickr:nsid', function(err, replies){
    if(err){
      res.send('Error: '+err);
    }else if(username == ''){
      res.send("{'code':100,'body':'Not a valid username.'}");
    }else if(replies[1] == null || replies[0] !== username){
      // Lookup NSID
      flickr.people.findByUsername(username, function(error, userinfo){
        if (error){
          res.send("{'code':100,'body':'User lookup error.'}");
        }else if(userinfo.username._content == 'undefined'){
          res.send("{'code':100,'body':'User undefined.'}");
        }else{
          console.dir(userinfo);
          // Only set username/nsid on verified username/nsid
          db.mset(req.sessionID+':flickr:username', userinfo.username._content, req.sessionID+':flickr:nsid', userinfo.nsid, function(err2, reply2){
            getPhotos(req, res, userinfo.nsid);
          });
        }
      });
    }else{
      getPhotos(req, res, replies[1]);
    }
  });
};

// Get latest photos from supied NSID and return an object to the client
/*
    Changes to flickrnode are *REQUIRED* (https://github.com/ciaranj/flickrnode/)
    
    people.js
    ---------
    People.prototype.getPublicPhotos= function(arguments, callback) {
      this._request.executeRequest("flickr.people.getPublicPhotos", arguments, false, null, callback);
    };
    
    photos.js
    ---------
    Photos.prototype.getSizes= function(photo_id, i, callback) {
      this._request.executeRequest("flickr.photos.getSizes", {"photo_id": photo_id}, false, null, callback, i);
    };
    
    request.js
    ----------
    Line 51:
    Request.prototype.executeRequest= function(method, arguments, sign_it, result_mapper, callback, extras) {
        var extras = extras || 0;
    
    Line 111:
    callback(null, res, extras);
    
    Line 126:
    callback(null, res, extras);
*/
var getPhotos = function(req, res, nsid){
  flickr.people.getPublicPhotos({'user_id':nsid, 'per_page':'18'}, function(error, photos){
    if(error){
      res.send("{'code':100,'body':'Whoops, something went wrong. Try that again.'}");
    }else{
      var photoInfo = new Array;
      var perpage = 0;
      if (photos.total < 18) {
        perpage = photos.total;
      }else{
        perpage = photos.perpage;
      }
      
      if (perpage == 0) {
        res.send("{'code':100,'body':'Try uploading some (public) photos to flickr.'}");
        return;
      };
      
      // Store photoIDs
      for (var i=0; i < perpage; i++) {
        photoInfo.push({
          'id':photos.photo[i].id,
          'title':photos.photo[i].title,
          'owner':photos.photo[i].owner,
          'thumb':'',
          'large':''
          });
      };

      // Get photo information
      var body = '';
      var count = 0;

      var photoSizes = new Array;
      
      for (var i=0; i < photoInfo.length; i++) {
        
        flickr.photos.getSizes(photoInfo[i].id, i, function(error2, sizes, idx){
           // Populate array at a specific location, because results come back as fast as possible (not in order)
          if(!error2){
            photoInfo[idx].thumb = sizes.size[0].source;
            photoInfo[idx].large = sizes.size[3].source;
          }
          
          count++;
          if(count == photoInfo.length){
            res.send({'code':200, 'body':photoInfo});
          }
        });
      }; // for
    } // else
  });
}

var getTwitterRequestToken = function(req, res){
  oa.getOAuthRequestToken(function(error, oauth_token, oauth_token_secret, results){
    if(error){
      res.send('error: ' + sys.inspect(error));
    }else {
      res.send('https://api.twitter.com/oauth/authorize?oauth_token=' + oauth_token);

      sys.puts('oauth_token: ' + oauth_token);
      sys.puts('oauth_token_secret: ' + oauth_token_secret);
      sys.puts('requestoken results: ' + sys.inspect(results));
      
      db.set(req.sessionID+':twitter:requestToken', oauth_token, redis.print);
      db.set(req.sessionID+':twitter:requestTokenSecret', oauth_token_secret, redis.print);
    }
  });
};

var getTwitterAccessToken = function(req, res){
  db.mget(req.sessionID+':twitter:requestToken', 
    req.sessionID+':twitter:requestTokenSecret', 
    req.sessionID+':twitter:verifier', 
    function(err, replies){
      oa.getOAuthAccessToken(replies[0], replies[1], replies[2], function(error, oauth_access_token, oauth_access_token_secret, results2){
        if(error){
          res.send('error: ' + sys.inspect(error));
        }else{
          res.send('accesstoken results: ' + sys.inspect(results2));
          /* // Uncomment for testing
          sys.puts('oauth_access_token: ' + oauth_access_token)
          sys.puts('oauth_access_token_secret: ' + oauth_access_token_secret)
          sys.puts('accesstoken results: ' + sys.inspect(results2))
          sys.puts("Requesting access token\n\n");
          */
          db.set(req.sessionID+':twitter:accessToken', oauth_access_token, redis.print);
          db.set(req.sessionID+':twitter:accessTokenSecret', oauth_access_token_secret, redis.print);
        }
      });
    });
};

var setTwitterStatus = function(req, res, content) {
  var body = {'status':content};
  
  db.mget(req.sessionID+':twitter:accessToken', 
    req.sessionID+':twitter:accessTokenSecret', 
    function(err, replies){
      oa.post("http://api.twitter.com/1/statuses/update.json", replies[0], replies[1], body, "application/x-www-form-urlencoded", function (error, data, response2) {
        if(error){
          res.send('Error: Something is wrong.');
        }else{
          res.send('Twitter status updated.');
          console.dir(response2);
        }
      });
    });
};

var initCheckExpired = setInterval(function(){
  sys.puts('\nChecking for expired sessions...');
  checkExpired();
}, 60000);

// Check for expired sessions and clean up the DB
var checkExpired = function(){
  db.smembers('users', function(err1, replies){
    // Loop through all users
    replies.forEach(function(reply1, i){
      var status = '';
      // Check to see if their DB session expired, by way of 'maxAge' => SETEX
      db.get(reply1, function(err2, reply2){
        status = i + ' ' + reply1 + ' ';
        if(reply2 == null){
          status += '=> EXPIRED. Deleting user information.';
          deleteUserInfo(reply1);
          db.srem('users', reply1);
        }else{
          status += '=> OK';
        }
        sys.puts(status);
      }); //db.get
    }); //forEach
  });
};

var deleteUserInfo = function(sessionID){
  db.del(sessionID+':flickr:nsid');
  db.del(sessionID+':flickr:username');

  db.del(sessionID+':twitter:verifier');
  db.del(sessionID+':twitter:requestToken');
  db.del(sessionID+':twitter:requestTokenSecret');

  db.del(sessionID+':twitter:accessToken');
  db.del(sessionID+':twitter:accessTokenSecret');
}

