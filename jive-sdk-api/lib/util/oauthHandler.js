var jive = require('../../../jive-sdk-service/api');
var q = require('q');

/**
 * An abstract class encapsulating the access token refresh flow.
 * <ol>
 *     <li>Attempt an operation.</li>
 *     <li>If the operation does not suceed due to 401, then attempt an OAuth2 access token refresh exchange.</li>
 *     <li>If the refresh is successful, retry the operation.</li>
 * </ol>
 * Override the accessTokenRefresher member function, to handle the request logic specific to the target OAuth2 provider.
 * @class oauthHandler
 * @abstract
 */

///////////////////////////////////////////////////////////////////////////////////
// private

/**
 * This is the default implementation of access token refresh.
 * @private
 * @memberof oauthHandler
 * @param {Object} oauth
 * @returns {Promise} Promise
 */
var accessTokenRefresher = function (oauth) {
    var postObject = {
        'grant_type': 'refresh_token',
        'refresh_token': oauth['refreshToken'],
        'client_id': oauth['oauth2ConsumerKey'],
        'client_secret': oauth['oauth2ConsumerSecret']
    };

    var headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

    return jive.util.buildRequest(oauth['originServerTokenRequestUrl'], 'POST', postObject, headers);
};

///////////////////////////////////////////////////////////////////////////////////
// public

/**
 * The default implementation of access token refresh.  If you
 * use oauth.js buildOAuthHandler, you will be required to provide
 * your own implementation of this function.
 * @memberof oauthHandler
 * @param oauth
 * @returns {}
 */
exports.accessTokenRefresher = function(oauth) {
    return accessTokenRefresher(oauth);
};

exports.doRequest = function( options ) {
    options = options || {};
    var url = options.url,
        headers = options.headers || {},
        oauth = options.oauth,
        method = options.method,
        postBody = options.postBody,
        requestOptions = options.requestOptions;

    if( !oauth ) {
        jive.logger.warn("No oauth credentials found. Continuing without them.");
        return jive.util.buildRequest( url, method, postBody, headers, requestOptions );
    }

    return exports.doOperation( function() {
        return jive.util.buildRequest( url, method, postBody, headers, requestOptions );
    }, {}, oauth, true );
};

exports.doOperation = function( operation, operationContext, oauth ) {
    return this.handleOperation( operation, operationContext, oauth, true );
};

exports.doRefreshTokenFlow = function(operationContext, oauth ) {

    jive.logger.debug("Trying refresh flow");

    var deferred = q.defer();

    this.accessTokenRefresher(operationContext, oauth).then(
        // success
        function (operationContext) {
            // success
            jive.logger.debug('Successfully refreshed token.');
            deferred.resolve(operationContext);
        },

        // failure
        function (result) {
            jive.logger.warn("RefreshTokenFlow failed.", result || '');
            deferred.reject( {statusCode: result.statusCode,
                error: 'Error refreshing token. Response in details field', details: result } );
        }
    );

    return deferred.promise;
};

exports.handleError = function( operationContext, oauth, response, retryIfFail ) {
    var deferred = q.defer();

    if (response.statusCode == 400) {
        jive.logger.info('Bad request (400)', response);
        deferred.reject(response);
    }
    else if (response.statusCode == 401 || response.statusCode == 403) {
        jive.logger.info("Unauthorized (" + response.statusCode + ")", response);

        if ( !retryIfFail ) {
            jive.logger.error('Not executing refresh flow. Failure on second attempt.', response);
            deferred.reject( response );
        } else {
            this.doRefreshTokenFlow( operationContext, oauth ).then(
                // successful token refresh
                function(update) {
                    deferred.resolve(update);
                },

                // failed token refresh
                function(err) {
                    deferred.reject( err );
                }
            );
        }
    } else {
        deferred.reject(response);
    }

    return deferred.promise;
};

exports.handleOperation = function (operation, operationContext, oauth, retryIfFail) {
    var p = q.defer();
    var self = this;

    operation( operationContext, oauth ).then(
        // successful push
        function (response) {
            p.resolve(response);
        },

        // failed push
        function(response) {
            return self.handleError( operationContext, oauth, response, retryIfFail).then(
                function(updatedOAuth) {
                    jive.logger.debug("Retrying operation.");
                    // retry operation once if refreshtoken was reason for error
                    self.handleOperation( operation, operationContext, updatedOAuth, false).then(
                        function(r) {
                            p.resolve(r);
                        },
                        function(e) {
                            p.reject(e);
                        }
                    );

                },

                function( err ) {
                    p.reject(err);
                }
            );
        }
    );

    return p.promise;
};

