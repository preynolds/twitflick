/*
  scripts.js
  
  Synopsis 
  Post status update to twitter including a shortened flickr photo URL.
  
  Project URL
  http://github.com/preynolds/twitflick
  
  Author
  Patrick Reynolds
  patrick@vunction.com
  
*/

var s;
var p;
var myTwitter;
var myFlickr;

window.addEvent('domready', function() {
  
  setTimeout(function(){window.scrollTo(0, 1);}, 100);

  init();
  
  var req = new Request({
    method: 'get',
    url: '/welcome',
    onRequest: function() { 
      $('thinking').addClass('active');
    },
    onComplete: function(response) {
      var render = JSON.decode(response);
      
      $('thinking').removeClass('active');
      
      // load the correct view based depending on render.code
      if (render.code == 0) {
        $('setup').addClass('active');
        $('twitter').getElement('div.new').addClass('active');
        $('twitter').getElement('div.returning').removeClass('active');
        $('settings').removeClass('active');
      }else if (render.code == 5) {
        $('setup').addClass('active');
        $('twitter').getElement('div.new').removeClass('active');
        $('twitter').getElement('div.returning').addClass('active');
        $('twitter').getElement('div.returning p').set('html', '@'+render.twitter);
        $('settings').removeClass('active');
      }else if (render.code == 10){
        $('setup').addClass('active');
        $('twitter').getElement('div.new').addClass('active');
        $('twitter').getElement('div.returning').removeClass('active');
        $('settings').removeClass('active');
        $('inputusername').value = myFlickr = render.flickr;
      }else if (render.code == 15){
        $('twitter').getElement('div.new').removeClass('active');
        $('twitter').getElement('div.returning').addClass('active');
        $('inputusername').value = myFlickr = render.flickr;
        $('twitter').getElement('div.returning p').set('html', '@'+render.twitter);
        
        photoRequest();
        
      };
    }
  }).send();
    
});


var init = function(){
  s = $('setup');
  p = $$('div.photos')[0];
  e = $('errors');

  $$('div.close').getElement('a').addEvent('click', function(event) { 
    event.stop();
    closeAllContents();
    document.body.removeClass('modal');
  });
  
  $('twitterupdatestatus').addEvent('click', function(event) { 
    event.stop();

    var tempContent = $('modal').getElement('textarea').value;

    var req = new Request({
      method: 'get',
      url: $('twitterupdatestatus').get('href'),
      data: { 'content' : tempContent },
      onRequest: function() { },
      onComplete: function(response) {
        //printr(response);
        document.body.removeClass('modal');
        closeAllContents();
        alert(response);
      }
    }).send();
  });

  $('twittertoken').addEvent('click', function(event) { 
    event.stop(); 

    var req = new Request({
      method: 'get',
      url: $('twittertoken').get('href'),
      onRequest: function() { },
      onComplete: function(response) {
        window.location = response;
      }
    }).send();
  });
  
  $('changeaccount').addEvent('click', function(event) { 
    event.stop(); 

    var req = new Request({
      method: 'get',
      url: $('twittertoken').get('href'),
      onRequest: function() { },
      onComplete: function(response) {
        window.location = response;
      }
    }).send();
  });

  $('inputusername').addEvent('keypress', function(event) {
    if(event.key == 'enter'){
      photoRequest();
    }
  });

  $$('a.getphotos').each(function(item, index){
    item.addEvent('click', function(event) { 
      event.stop(); 
      photoRequest();
    });
  });
  
  $('settings').getElement('a').addEvent('click', function(event) { 
    event.stop(); 
    
    $('setup').addClass('active');
    $('settings').removeClass('active');
    $('results').removeClass('active');
    
    setTimeout(function(){window.scrollTo(0, 1);}, 100);
  });
  
}

var closeAllContents = function(){
  document.body.removeClass('modal');
  $('modal').getElement('div.inside').setStyle('background-image','');
  $$('#modal div.contents').each(function(item, index){
    item.removeClass('active');
  });
}

var photoRequest = function(){
  var req = new Request({
    method: 'get',
    url: $('getphotos').get('href'),
    data: { 'username' : escape($('inputusername').value) },
    onRequest: function() { 
      $('thinking').addClass('active');
      $('setup').removeClass('active');
    },
    onComplete: function(response) {
      
      $('thinking').removeClass('active');
      
      p.empty();
      e.empty();
      
      var render;
      response = JSON.decode(response);
      if (response.code == 100) {
        
        $('setup').addClass('active');
        
        var aDiv = new Element('div', { 'class':'error' });            
        var aParagraph = new Element('p', { text: response.body });

        aParagraph.inject(aDiv);
        aDiv.inject(e);

      } else if (response.code == 200) {
        
        $('thinking').removeClass('active');
        $('settings').addClass('active');
        $('results').addClass('active');
        
        var req2 = new Request({
          method: 'get',
          url: '/getFlickrUsername',
          onComplete: function(response) {
            myFlickr = response;
            $('results').getElement('div.stats p.person span').set('html', myFlickr);
          }
        }).send();
        
        setTimeout(function(){window.scrollTo(0, 1);}, 100);
        
        response.body.each(function(item, index){
          var aDiv = new Element('div', { 'class':'photo' });
          var aImage = new Element('img', {
            'src': item.thumb,
            'title': item.title,
            'large': item.large,
            'id': item.id,
              events: {
                click: function(){
                  document.body.addClass('modal');
                  $('modal').setStyle('width', document.getSize().x);
                  $('modal').setStyle('height', document.getSize().y);
                  $('modal').getElement('div.post').addClass('active');
                  
                  $('modal').getElement('div.inside').setStyle('background-image','url('+this.getAttribute('large')+')');
                  $('modal').getElement('h2').set('text', this.title);
                  $('modal').getElement('textarea').set('text', ' http://flic.kr/p/'+baseEncode(this.id));
                  $('modal').getElement('textarea').focus();
                  $('modal').getElement('textarea').setSelectionRange(0,0);
                }
              }
          });
          aImage.inject(aDiv);
          aDiv.inject(p);
        }); // each
      }; // if
      closeAllContents();
    } // onComplete
  }).send(); // getphotos
}

var printr = function(data){
  console.log(data);
}

var intval = function(mixed_var, base) {
    // Get the integer value of a variable using the optional base for the conversion  
    // 
    // version: 1009.2513
    // discuss at: http://phpjs.org/functions/intval
    // +   original by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +   improved by: stensi
    // +   bugfixed by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +   input by: Matteo
    // +   bugfixed by: Brett Zamir (http://brett-zamir.me)
    // *     example 1: intval('Kevin van Zonneveld');
    // *     returns 1: 0
    // *     example 2: intval(4.2);
    // *     returns 2: 4
    // *     example 3: intval(42, 8);
    // *     returns 3: 42
    // *     example 4: intval('09');
    // *     returns 4: 9
    // *     example 5: intval('1e', 16);
    // *     returns 5: 30
    var tmp;

    var type = typeof( mixed_var );

    if (type === 'boolean') {
        return (mixed_var) ? 1 : 0;
    } else if (type === 'string') {
        tmp = parseInt(mixed_var, base || 10);
        return (isNaN(tmp) || !isFinite(tmp)) ? 0 : tmp;
    } else if (type === 'number' && isFinite(mixed_var) ) {
        return Math.floor(mixed_var);
    } else {
        return 0;
    }
};

var baseEncode = function(num, alphabet) {
  // http://tylersticka.com/
  // Based on the Flickr PHP snippet:
  // http://www.flickr.com/groups/api/discuss/72157616713786392/
  alphabet = alphabet || '123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  var base_count = alphabet.length;
  var encoded = '';
  while (num >= base_count) {
    var div = num/base_count;
    var mod = (num-(base_count*intval(div)));
    encoded = alphabet.charAt(mod) + encoded;
    num = intval(div);
  }
  if (num) encoded = alphabet.charAt(num) + encoded;
  return encoded;
};