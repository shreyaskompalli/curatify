/**
 * 
 */

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var SpotifyWebApi = require('spotify-web-api-node');
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
const { SSL_OP_SSLEAY_080_CLIENT_DH_BUG } = require('constants');
const { access } = require('fs');
var recents_list, sliders_list;

var spotifyApi = new SpotifyWebApi({
  clientId: 'f785c94c9cb64ee6954f436f39b0ee6c',
  clientSecret: 'b8bafe02839f4f6cb86bb02c73a6dad0',
  redirectUri: 'http://localhost:8888/callback'
});

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

// app.get('/login', function(req, res) {
//   var state = generateRandomString(16);
//   res.cookie(stateKey, state);
//   var spotifyApi = new SpotifyWebApi({
//     clientId: 'f785c94c9cb64ee6954f436f39b0ee6c',
//     redirectUri: 'http://localhost:8888/callback'
//   });
//   var scopes = ['user-read-private', 'user-read-email', 'user-read-recently-played', 'playlist-modify-public'];
//   var authURL = spotifyApi.createAuthorizeURL(scopes, state, true, 'token');

//   // your application requests authorization
//   res.redirect(authURL);
// });

app.get('/login', function(req, res) {
  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-read-email user-read-recently-played playlist-modify-public user-top-read';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: spotifyApi.getClientId(),
      scope: scope,
      redirect_uri: spotifyApi.getRedirectURI(),
      state: state
    }));
});

app.get('/callback', function(req, res) {
  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: spotifyApi.getRedirectURI(),
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(spotifyApi.getClientId() + ':' + spotifyApi.getClientSecret()).toString('base64'))
      },
      json: true
    };
  }

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      // var access_token = body.access_token,
      //     refresh_token = body.refresh_token;
      spotifyApi.setAccessToken(body.access_token);
      spotifyApi.setRefreshToken(body.refresh_token);
      var access_token = spotifyApi.getAccessToken(),
          refresh_token = spotifyApi.getRefreshToken();
      res.redirect('/#' +
        querystring.stringify({
          access_token: spotifyApi.getAccessToken(),
          refresh_token: spotifyApi.getRefreshToken()
        })
      );
    } else {
      res.redirect('/#' +
        querystring.stringify({
          error: 'invalid_token'
        }));
    }
  });
});

app.get('/generate', function(req, res) {
  var access_token = req.query.access_token;
  var options = {
    url: 'https://api.spotify.com/v1/me/player/recently-played',
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true
  };

  // use the access token to access the Spotify Web API
  request.get(options, function(error, response, body) {    // TODO: Error handling 
    var i;
    let history = [];
    for (i = 0; i < body.items.length; i++) {
      history.push(body.items[i].track);
    }
    buildRecents(history, access_token, res);
  });
});

app.get('/create', function(req, res) {
  if (req.query.type === 'recents') {
    if (recents_list) {
      createPlaylist(recents_list, req.query.access_token, res);
    } else {
      // Error handling, alert 
    }
  } else if (req.query.type === 'sliders') {
    if (sliders_list) {
      createPlaylist(recents_list, req.query.access_token, res);
    } else {
      // Error handling, alert 
    }
  } else {
      // Error Handling
      console.log("creation failure");
  }
});

app.get('/sliders', function(req, res) {
  var rec_url = 'https://api.spotify.com/v1/recommendations?'
    + querystring.stringify({
      seed_artists: req.query.seed_artists,
      limit: 50,
      target_danceability: req.query.danceability/100,
      target_energy: req.query.energy/100,
      // target_loudness: (loudness/num_tracks).toPrecision(3),
      // target_speechiness: (speechiness/num_tracks).toPrecision(3),
      // target_acousticness: (acousticness/num_tracks).toPrecision(3),
      // target_instrumentalness: (instrumentalness/num_tracks).toPrecision(3),
      // target_liveliness: (liveliness/num_tracks).toPrecision(3),
      // target_valence: (valence/num_tracks).toPrecision(3),
      // target_tempo: (tempo/num_tracks).toPrecision(3)
    });
    getRecommendations(rec_url, req.query.access_token, res, 'sliders');
});

app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(spotifyApi.getClientId() + ':' + spotifyApi.getClientSecret()).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      spotifyApi.setAccessToken(body.access_token);
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});

function buildRecents(history, access_token, res) {
  const num_tracks = history.length;
  var ids = "", seed_artists = "";
  var danceability = 0, energy = 0, loudness = 0, speechiness = 0, acousticness = 0, 
      instrumentalness = 0, liveliness = 0, valence = 0, tempo = 0;
  var all_artists = new Map();
  
  // Create ID list, populate artists map
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

  // Setting seed artists
  for (var i = 0; i < 3; i++) {
    let artist = mapMaxValue(all_artists);
    seed_artists += artist + ',';
    all_artists.delete(artist);
  }
  seed_artists = seed_artists.slice(0, seed_artists.length - 1);
  
  // Getting cumulative audio features
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

      // Running recommendation engine
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


      // Error Handling


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
      console.log("recommendation failure");
      console.log(response.statusCode);
      // Error handling
    }
  });
}

function createPlaylist(tracks, access_token, res) {
  var user_id;
  // var uris = "";
  // for (var i = 0; i < tracks.length; i++) {
  //   uris += tracks[i].uri + ",";
  // }
  // uris = uris.slice(0, uris.length-1);
  let user_options = {
    url: 'https://api.spotify.com/v1/me',
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true
  };
  request.get(user_options, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      user_id = body.id;
      //console.log(user_id);
      let create_options = {
        url: 'https://api.spotify.com/v1/users/' + user_id + '/playlists',
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
            if (!error && response.statusCode === 201) {
              console.log(body);
            } else {
              console.log('failure1');
              // Error handling
            }
          });
        } else {
          
          console.log('failure2');
          // Error Handling


        }
      });
    } else {

      console.log('failure3');
      console.log(response.statusCode);
      
      // Error Handling


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

console.log('Listening on 8888');
app.listen(8888);

