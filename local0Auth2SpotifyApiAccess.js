'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const helpers = require('./helpers');
const base64url = require('base64url');
const crypto = require('crypto');
const querystring = require('querystring');
const opn = require('open');
const EventEmitter = require('events');
const readline = require('readline');


class ApiEmitter extends EventEmitter {};

module.exports = class ApiAccesser {
    
    /**
     * A class for accessing the Spotify API "locally" (without an intermediary webserver on the internet) using the OAuth 2.0 PKCE flow.
     * Until end() is called, access token are automatically refreshed 5 minutes before they become invalid.
     * @param {string} authFilePath The path at which the file containing authentication data is to be created or found
     * @param {string} clientId The app's Client ID
     * @param {Array} scope An array containing the Spotify API scopes that are to be used
     * @param {Object} options An object containing further options
     */
    constructor(authFilePath, clientId, options) {
        var defaultOptions = {
            scope: [],
            forceReauth: false,
            autoAuth: true
        }
        Object.keys(options).forEach((key) => {
            if (Object.keys(defaultOptions).includes(key))
                defaultOptions[key] = options[key];
        });
        options = defaultOptions;

        // Always include these two scope names, because they will be added on refresh anyway, for some reason
        ['user-read-private', 'user-read-email'].forEach((scopeName) => {
            if (!options.scope.includes(scopeName)) { options.scope.push(scopeName) };
        });

        this.emitter = new ApiEmitter();
        this.on = this.emitter.on;

        this._priv.clientId = clientId;
        this._priv.authFilePath = authFilePath;
        this._priv.scope = options.scope;
        this._priv.noRequestsBefore = 0;

        // console.log(options);

        // Check existing auth file integrity
        var authIsOk = !(options.forceReauth);
        if (fs.existsSync(authFilePath) && authIsOk) {
            try {
                var authCandidate = JSON.parse(fs.readFileSync(authFilePath));
                var requiredKeys = ['access_token', 'token_type', 'expires_in', 'refresh_token', 'scope', 'expires_at'];
                requiredKeys.forEach((key) => {
                    if (!Object.keys(authCandidate).includes(key))
                        throw new Error(`Missing key ${key}`)
                });
                options.scope.forEach((item) => {
                    if (!authCandidate['scope'].split(' ').includes(item))
                        throw new Error(`Missing scope ${item}`)
                });
                authCandidate['scope'].split(' ').forEach((item) => {
                    if (!options.scope.includes(item))
                        throw new Error(`New scope ${item}`)
                });
            } catch (e) {
                console.log(e);
                authIsOk = false;
            }
        } else {
            authIsOk = false;
        }
        var tokenPromise = null;

        // Choose the appropriate procedure based on whether a valid token, a refreshable token or no usable token is already stored
        if (!authIsOk) {
            console.log('Initialising with new authorisation');
            tokenPromise = this.initialTokenGet(options.autoAuth);
        } else {
            var refreshInMs = authCandidate['expires_at'] - Date.now() - (5 * 60 * 1000);
            if (refreshInMs <= 0) {
                console.log('Initialising with refreshed token');
                tokenPromise = this.getRefreshed(authCandidate['refresh_token']);
            } else {
                console.log('Initialising with existing token');
                tokenPromise = new Promise((resolve, reject) => { resolve(authCandidate) });
            }
        }

        tokenPromise.then((res) => {
            fs.writeFileSync(authFilePath, JSON.stringify(res), { encoding: 'utf8' });
            this._priv.authInfo = res;
            this.refreshForever();
            this.emitter.emit('ready');
        });
    }

    /**
     * @private
     */
    initialTokenGet(autoAuth){
        return new Promise((resolve, reject) => {
            var codeVerifier = helpers.genRandB64UrlString();

            var codeChallenge = crypto.createHash('sha256')
            codeChallenge.write(codeVerifier);
            codeChallenge.end();
            codeChallenge = base64url(codeChallenge.digest());

            const authParams = {
                client_id: this._priv.clientId,
                response_type: 'code',
                redirect_uri: 'http://localhost:1312/',
                code_challenge_method: 'S256',
                code_challenge: codeChallenge,
                state: helpers.genRandB64UrlString(20),
                scope: this._priv.scope.join(' ')
            }

            // console.log(authParams.state);

            var authQuery = querystring.stringify(authParams);
            var authUri = 'https://accounts.spotify.com/authorize?' + authQuery;
            console.log(authUri);
            var timeAtGet = Date.now();

            new Promise((resolve, reject) => {
                if (autoAuth) {
                    var options = {};
                    var sockets = [];
                    const server = http.createServer(options, (req, res) => {
                        res.writeHead(200);
                        const doc = '<html><body><h1>You may now close this tab.</h1></body></html>\n';
                        res.end(fs.readFileSync('src/callback.html'));
                        var query = req.url.split('?')[1];
                        var queryParams = querystring.parse(query);
                        console.log(queryParams);
                        server.close();
                        sockets.forEach((socket) => {
                            socket.destroy();
                        });
                        resolve(queryParams);
                    });
                    server.on('connection', (socket) => {
                        sockets.push(socket);
                    });

                    server.listen(1312);
                    opn(authUri);
                } else {
                    console.log(authUri);
                    var rl = readline.createInterface({
                        input: process.stdin,
                        output: process.stdout
                    });
                    rl.question('Give callback URL pls: ', (answer) => {
                        rl.close();
                        rl = null;
                        var query = answer.split('?')[1];
                        var queryParams = querystring.parse(query);
                        resolve(queryParams);
                    });
                }
            }).then((params) => {
                if (Object.keys(params).includes('error')) {
                    throw new Error(params.error);
                } else if (params.state !== authParams.state) {
                    console.log(authParams.state, '\n', params.state);
                    throw new Error('Mismatched states');
                }
                console.log(params);
                // console.log(params);

                const postData = querystring.stringify({
                    client_id: this._priv.clientId,
                    grant_type: 'authorization_code',
                    code: params.code,
                    redirect_uri: 'http://localhost:1312/',
                    code_verifier: codeVerifier
                });

                return helpers.promiseRequest({
                    hostname: 'accounts.spotify.com',
                    path: '/api/token',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                }, postData);
            }).then((res) => {
                var resData = JSON.parse(res.data.toString('utf8'));
                resData['expires_at'] = timeAtGet + (resData['expires_in'] * 1000);
                console.log(resData);
                resolve(resData);
            }).catch((e) => {
                reject(e);
            });
        });
    }

    /**
     * @private
     */
    getRefreshed(refreshToken){
        return new Promise((resolve, reject) => {
            const postData = querystring.stringify({
                client_id: this._priv.clientId,
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            });

            var timeAtGet = Date.now();

            helpers.promiseRequest({
                hostname: 'accounts.spotify.com',
                path: '/api/token',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                }
            }, postData).then((res) => {
                var resData = JSON.parse(res.data.toString('utf8'));
                resData['expires_at'] = timeAtGet + (resData['expires_in'] * 1000);
                resolve(resData);
            }).catch((e) => {
                reject(e);
            });
        });
    }

    /**
     * After entering this function, the object's access token will always be refreshed 5 minutes before it expires.
     * @private
     */
    refreshForever(){
        // var authInfo = JSON.parse(fs.readFileSync(this.authFilePath));
        var refreshInMSecs = this._priv.authInfo['expires_at'] - Date.now() - (5 * 60 * 1000);
        // var refreshInMSecs = 1000 * 60 * 2
        console.log(`Refreshing in ${refreshInMSecs / 1000 / 60} minutes`);
        this._priv.refreshTimeout = setTimeout(() => {
            console.log('Refreshing..');
            this.getRefreshed(this._priv.authInfo['refresh_token']).then((res) => {
                fs.writeFileSync(this._priv.authFilePath, JSON.stringify(res), { encoding: 'utf8' });
                this._priv.authInfo = res;
                this.refreshForever();
            });
        }, refreshInMSecs);
    }

    /**
     * Makes a request to the Spotify API.
     * @param {string} method HTTP method for the endpoint, e.g. 'GET'
     * @param {string} endpoint The API endpoint to call, e.g. '/v1/me/player'
     * @param {Object} params An object containing query parameters for the API call, e.g. {'market': 'from_token'}
     * @return A promise which resolves to {status: (int), data: (object), retry: (milliseconds)}, where retry is included only when the status is 429
     */
    callApi(method, endpoint, params = {}){
        return new Promise((resolve, reject) => {
            var auth = `${this._priv.authInfo['token_type']} ${this._priv.authInfo['access_token']}`;
            // console.log(auth);
            if (Date.now() > this._priv.noRequestsBefore) {
                helpers.promiseRequest({
                    hostname: 'api.spotify.com',
                    path: endpoint + '?' + querystring.stringify(params),
                    method: method,
                    headers: {
                        'Authorization': auth
                    }
                }).then((res) => {
                    try {
                        var resData = JSON.parse(res.data.toString('utf8'));
                    } catch (e) {
                        var resData = null;
                    }
                    if (res.status === 429) {
                        this._priv.noRequestsBefore = Date.now() + 1000 * res.headers['retry-after'];
                    }
                    resolve({ status: res.status, data: resData, retry: this._priv.noRequestsBefore });
                    // console.log(res.headers);
                }).catch((e) => {
                    reject(e);
                });
            } else {
                resolve({ status: 429, data: null, retry: this._priv.noRequestsBefore });
            }
        });
    }

    /**
     * Stops auto-refreshing. Call this when you no longer need the object or want your script to be able to exit.
     */
    end(){
        clearTimeout(this._priv.refreshTimeout);
    }
}