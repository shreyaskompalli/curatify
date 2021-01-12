var express = require('express'); 
var request = require('request'); 
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var recents_list, sliders_list;

var clientId = 'f785c94c9cb64ee6954f436f39b0ee6c';
var redirectUri = 'https://arcane-beach-91282.herokuapp.com/callback';
// var redirectUri = 'http://localhost:8888';

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cors())
   .use(cookieParser());

app.get('/login', function(req, res) {
  var state = generateRandomString(16);
  res.cookie(stateKey, state);
  var scope = 'user-read-private user-read-email user-read-recently-played playlist-modify-public user-top-read';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'token',
      client_id: clientId,
      scope: scope,
      redirect_uri: redirectUri,
      state: state
    }));
});

app.get('/generate', function(req, res) {
  var access_token = req.query.access_token;
  var options = {
    url: 'https://api.spotify.com/v1/me/player/recently-played',
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true
  };

  request.get(options, function(error, response, body) { 
    if (!error && response.statusCode === 200)  {
      let history = [];
      for (var i = 0; i < body.items.length; i++) {
        history.push(body.items[i].track);
      }
      buildRecents(history, access_token, res);
    } else {
      res.status(response.statusCode).send({error: "authentication error"});
    }
  });
});

app.get('/create', function(req, res) {
  if (req.query.type === 'recents') {
    if (recents_list) {
      createPlaylist(recents_list, req.query.access_token, res);
    } else {
      res.status(503).send({error: 'recents track list is empty'});
    }
  } else if (req.query.type === 'sliders') {
    if (sliders_list) {
      createPlaylist(sliders_list, req.query.access_token, res);
    } else {
      res.status(503).send({error: 'sliders track list is empty'});
    }
  } else {
    res.status(503).send({error: 'playlist creation type does not exist'});
  }
});

app.get('/sliders', function(req, res) {
  var rec_url = 'https://api.spotify.com/v1/recommendations?'
    + querystring.stringify({
      seed_artists: req.query.seed_artists,
      limit: 50,
      target_danceability: req.query.danceability/100,
      target_energy: req.query.energy/100,
      target_loudness: req.query.loudness/100,
      target_acousticness: req.query.acousticness/100,
      target_instrumentalness: req.query.instrumentalness/100,
      target_valence: req.query.valence/100,
    });
    getRecommendations(rec_url, req.query.access_token, res, 'sliders');
});

function buildRecents(history, access_token, res) {
  const num_tracks = history.length;
  var ids = "", seed_artists = "";
  var danceability = 0, energy = 0, loudness = 0, speechiness = 0, acousticness = 0, 
      instrumentalness = 0, liveliness = 0, valence = 0, tempo = 0;
  var all_artists = new Map();
  
  for (var i = 0; i < history.length; i++) {
    ids += history[i].id + ",";
    for (var artist of history[i].artists) {
      if (all_artists.has(artist.id)) {
        all_artists.set(artist.id, all_artists.get(artist.id) + 1);
      } else {
        all_artists.set(artist.id, 1);
      }
    }
  }
  ids = ids.slice(0, ids.length - 1);

  for (var i = 0; i < 3; i++) {
    let artist = mapMaxValue(all_artists);
    seed_artists += artist + ',';
    all_artists.delete(artist);
  }
  seed_artists = seed_artists.slice(0, seed_artists.length - 1);
  
  let feature_options = {
    url: 'https://api.spotify.com/v1/audio-features?ids=' + ids,
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true
  };
  request.get(feature_options, function(error, response, feat_body) {
    if (!error && response.statusCode === 200) {
      for (var features of feat_body.audio_features) {
        if (features) {
          danceability += features.danceability;
          energy += features.energy;
          loudness += features.loudness;
          speechiness += features.speechiness;
          acousticness += features.acousticness;
          instrumentalness += features.instrumentalness;
          liveliness += features.liveliness;
          valence += features.valence;
          tempo += features.tempo;
        }
      }

      var rec_url = 'https://api.spotify.com/v1/recommendations?'
      + querystring.stringify({
        seed_artists: seed_artists,
        limit: 50,
        target_danceability: (danceability/num_tracks).toPrecision(3),
        target_energy: (energy/num_tracks).toPrecision(3),
        target_loudness: (loudness/num_tracks).toPrecision(3),
        target_speechiness: (speechiness/num_tracks).toPrecision(3),
        target_acousticness: (acousticness/num_tracks).toPrecision(3),
        target_instrumentalness: (instrumentalness/num_tracks).toPrecision(3),
        target_liveliness: (liveliness/num_tracks).toPrecision(3),
        target_valence: (valence/num_tracks).toPrecision(3),
        target_tempo: (tempo/num_tracks).toPrecision(3)
      });
      getRecommendations(rec_url, access_token, res, 'recents');
    } else {
      res.status(response.statusCode).send({error: "audio features error"});
    }
  });
}

function getRecommendations(url, access_token, res, rec_type) {
  let rec_options = {
    url: url,
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true
  };
  request.get(rec_options, function(error, response, rec_body) {
    if (!error && response.statusCode === 200) {
      if (rec_type === 'recents') {
        recents_list = rec_body.tracks;
      } else if (rec_type === 'sliders') {
        sliders_list = rec_body.tracks;
      }
      res.send({
        'track_list': rec_body.tracks
      });
    } else {
      res.status(response.statusCode).send({error: "recommendations error"});
    }
  });
}

function createPlaylist(tracks, access_token, res) {
  let user_options = {
    url: 'https://api.spotify.com/v1/me',
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true
  };
  request.get(user_options, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      let create_options = {
        url: 'https://api.spotify.com/v1/users/' + body.id + '/playlists',
        headers: { 
          'Authorization': 'Bearer ' + access_token, 
          'Content-Type': 'application/json'
        },
        body: {
          "name": "Curatify Playlist",
          "description": "A playlist created based on your recently played tracks.",
        },
        json: true
      };
      request.post(create_options, function(error, response, body) {
        if (!error && (response.statusCode === 200 || response.statusCode === 201)) {
          var add_options = {
            url: 'https://api.spotify.com/v1/playlists/' + body.id + '/tracks',
            headers: {
              'Authorization': 'Bearer ' + access_token, 
              'Content-Type': "application/json"
            },
            body: {
              'uris': tracks.map((track) => track.uri)
            },
            json: true
          };
          request.post(add_options, function(error, response, body) {
            if (!error && response.statusCode === 200) {
              res.status(200).send({success: "playlist created"});
            } else {
              res.status(response.statusCode).send({error: "adding tracks error"});
            }
          });
        } else {
          res.status(response.statusCode).send({error: "creating playlist error"});
        }
      });
    } else {
      res.status(response.statusCode).send({error: "user data error"});
    }
  });
}

function mapMaxValue(map) {
  var maxKey;
  for (var key of map.keys()) {
      maxKey = (!maxKey || map.get(maxKey) < map.get(key)) ? key : maxKey;
  }
  return maxKey;
}

app.set('port', process.env.PORT || 8888);
console.log('Listening on ' + app.get('port'));
app.listen(app.get('port'));