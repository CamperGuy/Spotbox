const http = require('http');
const https = require('https');
const base64url = require('base64url');
const crypto = require('crypto');

const genRandB64UrlString = (length = 128) => {
    return base64url(crypto.randomBytes(Math.ceil(length * (3 / 4)))).slice(0, length);
}

const promiseRequest = (options, body = null, secure = true) => {
    return new Promise((resolve, reject) => {
        var httpType = secure ? https : http;

        const req = httpType.request(options, (res) => {
            var data = [];
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                if (typeof chunk === 'string') {
                    chunk = Buffer.from(chunk, 'utf8');
                }
                data.push(chunk);
            });
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    data: Buffer.concat(data)
                });
            });
            res.on('error', (e) => {
                reject(e);
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        if (body !== null) {
            req.write(body);
        }
        req.end();
    });
}
const getScreenTextObject = (firstLine, secondLine) => {
    firstLine = cleanText(firstLine);
    secondLine = cleanText(secondLine);
    return {
        lineOne: firstLine,
        lineTwo: secondLine
    };
}

const stringifyArtists = (artistArray) => {
    var stringified = '';
    artistArray.forEach(function(current, index) { 
        stringified += current;
        if (index != artistArray.length - 1){
            stringified += ', ';
        }
    });
    return stringified;
}

const isScreenChanging = (current, printing) => {
    if (current == null)
        return true;
    var clo = cleanText(current.lineOne);
    var clt = cleanText(current.lineTwo);
    var plo = cleanText(printing.lineOne);
    var plt = cleanText(printing.lineTwo);

    if ((clo !== plo && clt !== plt)){
        return true;
    }
    return false;
}

const cleanText = (text) => {
    var forbidden =   ['ä', 'ö', 'ü', 'Ä', 'Ö', 'Ü', 'ø', 'ç', 'ÿ', 'ý', 'û', 'ú', 'ù', 'õ', 'ô', 'ó', 'ò', 'ñ', 'ï', 'î', 'í', 'ì', 'ë', 'ê', 'é', 'è', 'æ', 'å', 'ã', 'â', 'á', 'à', 'ß', 'Ý', 'Û', 'Ú', 'Ù', 'Ø', 'Õ', 'Ô', 'Ó', 'Ò', 'Ñ', 'Ï', 'Ï', 'Í', 'Ì', 'Ë', 'Ê', 'É', 'È', 'Ç', 'Æ', 'Å', 'Ã', 'Â', 'Á', 'À', '·', 'ē', 'ĭ', '•', '….'];
    var replacement = ['a', 'o', 'u', 'A', 'O', 'U', 'o', 'c', 'y', 'y', 'u', 'u', 'u', 'u', 'o', 'o', 'o', 'n', 'i', 'i', 'i', 'i', 'e', 'e', 'e', 'e', 'ae', 'a', 'a', 'a', 'a', 'a', 'ss', 'Y', 'U', 'U', 'U', 'O', 'O', 'O', 'O', 'O', 'N', 'I',  'I', 'I', 'I', 'E', 'E', 'E', 'E', 'C', 'AE', 'A', 'A', 'A', 'A', 'A', '.', 'e', 'i', '.', '...'];

    for (var i = 0; i < forbidden.length; i++){
        //if (text.contains(forbidden[i]))
        text = text.replace(forbidden[i], replacement[i]);
    }
    return text;
}

exports.promiseRequest = promiseRequest;
exports.genRandB64UrlString = genRandB64UrlString;
exports.getScreenTextObject = getScreenTextObject;
exports.isScreenChanging = isScreenChanging;
exports.stringifyArtists = stringifyArtists;