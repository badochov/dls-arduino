

// //========== Hardware Part ==========
// var audio_context;
// var audio_stream, source, node;
// var sample_rate;
// var bitAnalyzer;


// function init(deviceId, force) {
//     audio_context = new AudioContext();

//     sample_rate = audio_context["sampleRate"] / 1200;
//     bitAnalyzer = appendBit;

//     agc_factor = 0.001 / sample_rate;
//     lastVal.length = Math.ceil(sample_rate / 6);
//     bitBuffer = [];
//     byteBuffer = [];

//     var selectObj = {};

//     if (deviceId) {
//         selectObj["deviceId"] = {
//             "exact": deviceId
//         };
//     }

//     if (audio_stream == undefined) {
//         return navigator.mediaDevices.getUserMedia({
//             "audio": selectObj
//         }).then(function (stream) {
//             if (audio_context.state == 'suspended' && !force) {
//                 return Promise.reject();
//             }
//             success(stream);
//         }, console.log);
//     } else {
//         return Promise.resolve();
//     }
// }
// var last_power = 1;
// var agc_factor = 0.0001;

// function success(stream) {
//     audio_stream = stream;
//     source = audio_context["createMediaStreamSource"](stream);
//     node = audio_context["createScriptProcessor"](1024, 1, 1);

//     node["onaudioprocess"] = function (e) {
//         // console.log(+new Date);
//         var input = e["inputBuffer"]["getChannelData"](0);
//         // var output = e["outputBuffer"]["getChannelData"](0);
//         //AGC
//         for (var i = 0; i < input.length; i++) {
//             var power = input[i] * input[i];
//             last_power = Math.max(0.0001, last_power + (power - last_power) * agc_factor);
//             var gain = 1 / Math.sqrt(last_power);
//             procSignal(input[i] * gain);
//             // output[i] = input[i] * gain / 500;
//         }
//         return;
//     };
//     source["connect"](node);
//     node["connect"](audio_context["destination"]);
// }

// //========== Audio2Bits Part ==========
// var lastVal = [];
// var lastSgn = 0;
// var THRESHOLD_SCHM = 0.2;
// var THRESHOLD_EDGE = 0.7;
// var lenVoltageKeep = 0;
// var distortionStat = 0;



// probably only impornt from here

function procSignal(signal) {
    // signal = Math.max(Math.min(signal, 1), -1);
    // Schmidt trigger

    lastVal.unshift(signal);
    var isEdge = (lastVal.pop() - signal) * (lastSgn ? 1 : -1) > THRESHOLD_EDGE &&
        Math.abs(signal - (lastSgn ? 1 : -1)) - 1 > THRESHOLD_SCHM &&
        lenVoltageKeep > sample_rate * 0.6;

    if (isEdge) {
        for (var i = 0; i < Math.round(lenVoltageKeep / sample_rate); i++) {
            bitAnalyzer(lastSgn);
        }
        lastSgn ^= 1;
        lenVoltageKeep = 0;
    } else if (lenVoltageKeep > sample_rate * 2) {
        bitAnalyzer(lastSgn);
        lenVoltageKeep -= sample_rate;
    }
    lenVoltageKeep++;

    //note: signal power has already been normalized. So distortionStat will tends to zero ideally.
    if (last_bit_length < 10) {
        distortionStat = Math.max(0.0001, distortionStat + (Math.pow(signal - (lastSgn ? 1 : -1), 2) - distortionStat) * agc_factor);
    } else if (last_bit_length > 100) {
        distortionStat = 1;
    }
}


//========== Bits Analyzer ==========
var bitBuffer = [];
var byteBuffer = [];
var idle_val = 0;
var last_bit = 0;
var last_bit_length = 0;
var no_state_length = 0;

function appendBit(bit) {
    bitBuffer.push(bit);
    if (bit != last_bit) {
        last_bit = bit;
        last_bit_length = 1;
    } else {
        last_bit_length++;
    }
    no_state_length++;
    if (last_bit_length > 10) { //IDLE
        idle_val = bit;
        // console.log(bitBuffer.length);
        bitBuffer = [];

        if (byteBuffer.length != 0) {
            // console.log(byteBuffer, idle_val);
            byteBuffer = [];
        }

        if (last_bit_length > 100 && stackmat_state.on) {
            stackmat_state.on = false;
            stackmat_state.power = last_power;
            // console.log('off');
        } else if (no_state_length > 700) {
            no_state_length = 100;
            stackmat_state.power = last_power;
        }
    } else if (bitBuffer.length == 10) {
        if (bitBuffer[0] == idle_val || bitBuffer[9] != idle_val) {
            bitBuffer = bitBuffer.slice(1);
        } else {
            var val = 0;
            for (var i = 8; i > 0; i--) {
                val = val << 1 | (bitBuffer[i] == idle_val ? 1 : 0);
            }
            byteBuffer.push(String.fromCharCode(val));
            sendToPi(byteBuffer); // send signal to pi
            bitBuffer = [];
        }
    }
}


var stackmat_state = {
    time_milli: 0,
    unit: 10,
    on: false,
    greenLight: false,
    leftHand: false,
    rightHand: false,
    running: false,
    unknownRunning: true,
    signalHeader: 'I',
    noise: 1,
    power: 1
};

var callback = $.noop;
