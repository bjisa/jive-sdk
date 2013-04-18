var http = require('http');
var url = require('url');
var jive = require('../api');

exports.buildAuthorizeUrlResponseMap = function( oauth2Conf, callback, state ) {
    var jiveRedirectUrl = encodeURIComponent(callback);

    var stateToEncode = jive.util.base64Encode( { 'jiveRedirectUrl' :  jiveRedirectUrl } );
    if ( state ) {
        jive.util.updateJson( state , stateToEncode );
    }

    var clientUrl = jive.service.options['clientUrl'] + ':' + jive.service.options['port'];
    var redirectUrl = process.env['jive.redirect'] || encodeURIComponent(clientUrl + '/oauth2Callback');
    var oauth2AuthorizePath = oauth2Conf['oauth2AuthorizePath'];
    var oauth2ConsumerKey = oauth2Conf['oauth2ConsumerKey'];
    var originServerAuthorizationUrl = oauth2Conf['originServerAuthorizationUrl'];

    return {
        'url' :  originServerAuthorizationUrl + "?" +
            "state=" + stateToEncode +
            "&redirect_uri=" + redirectUrl +
            "&client_id=" + oauth2ConsumerKey +
            "&response_type=code"
    };
};

exports.buildOauth2CallbackObject = function(oauth2Conf, code, extraParams ) {

    var clientUrl = jive.service.options['clientUrl'] + ':' + jive.service.options['port'];
    var redirectUrl =  process.env['jive.redirect'] || encodeURIComponent( clientUrl + '/oauth2Callback' );

    var postObject = {
        'grant_type'        : 'authorization_code',
        'client_id'         : oauth2Conf['oauth2ConsumerKey'],
        'client_secret'     : oauth2Conf['oauth2ConsumerSecret'],
        'redirect_uri'      : redirectUrl,
        'code'              : code
    };

    if ( extraParams ) {
        jive.util.updateJson( extraParams, postObject );
    }

    return postObject;
};
