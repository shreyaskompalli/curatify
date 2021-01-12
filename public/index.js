(function() {

    /**
     * Obtains parameters from the hash of the URL
     * @return Object
     */
    function getHashParams() {
      var hashParams = {};
      var e, r = /([^&;=]+)=?([^&;]*)/g,
          q = window.location.hash.substring(1);
      while ( e = r.exec(q)) {
         hashParams[e[1]] = decodeURIComponent(e[2]);
      }
      return hashParams;
    }

    var rpSource = document.getElementById('rp-template').innerHTML,
        rpTemplate = Handlebars.compile(rpSource),
        rpPlaceholder = document.getElementById('recently-played');
    
    var ntSource = document.getElementById('nt-template').innerHTML,
        ntTemplate = Handlebars.compile(ntSource),
        ntPlaceholder = document.getElementById('new-tracks');
    
    var taSource = document.getElementById('top-artists-template').innerHTML,
        taTemplate = Handlebars.compile(taSource),
        taPlaceholder = document.getElementById('top-artists');
      
    var sliderSource = document.getElementById('nt-template').innerHTML,
        sliderTemplate = Handlebars.compile(sliderSource),
        sliderPlaceholder = document.getElementById('slider-tracks');

    var params = getHashParams();

    var access_token = params.access_token,
        refresh_token = params.refresh_token,
        error = params.error;
      
    var recs_list;

    var top_artists = "";

    if (error) {
      alert('There was an error during the authentication');
    } else {
      if (access_token) {
        $('#login').hide();
        $('#loggedin').show();

        $.ajax({
            url: 'https://api.spotify.com/v1/me/player/recently-played',
            headers: {
              'Authorization': 'Bearer ' + access_token
            },
            success: function(response) {
              rpPlaceholder.innerHTML = rpTemplate(response);

              $('#login').hide();
              $('#loggedin').show();
            },
            error: function(response) {
              alert("Something went wrong! Please refresh, sign in, and try again.");
            }
        });

        $.ajax({
            url: 'https://api.spotify.com/v1/me/top/artists?limit=5&time_range=short_term',
            headers: {
              'Authorization': 'Bearer ' + access_token
            },
            success: function(response) {
              taPlaceholder.innerHTML = taTemplate(response);
              for (var artist of response.items) {
                top_artists += artist.id + ",";
              }
              top_artists = top_artists.slice(0, top_artists.length - 1);
            },
            error: function(response) {
              alert("Something went wrong! Please refresh, sign in, and try again.");
            }
        });
      } else {
          $('#login').show();
          $('#loggedin').hide();
      }

      document.getElementById('recents-generate').addEventListener('click', function() {
        $.ajax({
          url: '/generate',
          data: {
            'access_token': access_token
          },
          success: function(data) {
            ntPlaceholder.innerHTML = ntTemplate({
              tracks: data.track_list
            });
          },
          error: function(data) {
            alert("There was a(n)" + data.error + ". Sorry about that! Please refresh the page and try again.");
          }
        });
      }, false);

      document.getElementById('sliders-generate').addEventListener('click', function() {
        $.ajax({
          url: '/sliders',
          data: {
            'access_token': access_token,
            'seed_artists': top_artists,
            'danceability': document.getElementById('danceability').value,
            'energy': document.getElementById('energy').value,
            'acousticness': document.getElementById('acousticness').value,
            'loudness': document.getElementById('loudness').value,
            'instrumentalness': document.getElementById('instrumentalness').value,
            'valence': document.getElementById('valence').value,
          },
          success: function(data) {
            sliderPlaceholder.innerHTML = sliderTemplate({
              tracks: data.track_list
            });
          },
          error: function(data) {
            alert("There was a(n)" + data.error + ". Sorry about that! Please refresh the page and try again.");
          }
        });
      }, false);

      document.getElementById('recents-create').addEventListener('click', function() {
        $.ajax({
          url: '/create',
          data: {
            'access_token': access_token,
            'type': 'recents'
          },
          success: function(data) {
            alert("Playlist created! Check your Spotify account.");
          },
          error: function(data) {
            alert("You have not generated any tracks yet!");
          }
        });
      }, false);

      document.getElementById('sliders-create').addEventListener('click', function() {
        $.ajax({
          url: '/create',
          data: {
            'access_token': access_token,
            'type': 'sliders'
          },
          success: function(data) {
            alert("Playlist created! Check your Spotify account.");
          },
          error: function(data) {
            alert("You have not generated any tracks yet!");
          }
        });
      }, false);
    }
  })();