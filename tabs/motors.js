/*global helper,MSP,MSPChainerClass,googleAnalytics,GUI,mspHelper,MOTOR_RULES,TABS,$,MSPCodes,ANALOG,MOTOR_DATA,chrome,PLATFORM_MULTIROTOR,BF_CONFIG,PLATFORM_TRICOPTER,SERVO_RULES,FC,SERVO_CONFIG,SENSOR_DATA,_3D,MISC,MIXER_CONFIG,OUTPUT_MAPPING*/
'use strict';

TABS.motors = {
    allowTestMode: false,
    feature3DEnabled: false,
    feature3DSupported: false
};
TABS.motors.initialize = function (callback) {
    var self = this;

    self.armed = false;
    self.feature3DSupported = false;
    self.allowTestMode = true;

    var $motorsEnableTestMode;

    if (GUI.active_tab !== 'motors') {
        GUI.active_tab = 'motors';
        googleAnalytics.sendAppView('Motors');
    }

    var loadChainer = new MSPChainerClass();

    loadChainer.setChain([
        mspHelper.loadMisc,
        mspHelper.loadBfConfig,
        mspHelper.load3dConfig,
        mspHelper.loadMotors,
        mspHelper.loadMotorMixRules,
        mspHelper.loadServoMixRules,
        mspHelper.loadMixerConfig,
        mspHelper.loadServoMixRules,
        mspHelper.loadServoConfiguration,
        mspHelper.loadOutputMapping,
        mspHelper.loadRcData,
    ]);
    loadChainer.setExitPoint(load_html);
    loadChainer.execute();
    update_arm_status();

    var saveChainer = new MSPChainerClass();

    saveChainer.setChain([
        mspHelper.sendServoConfigurations,
        mspHelper.saveToEeprom
    ]);
    saveChainer.setExitPoint(function () {
        GUI.log(chrome.i18n.getMessage('eeprom_saved_ok'));
        MOTOR_RULES.cleanup();
    });

    function load_html() {
        $('#content').load("./tabs/motors.html", onLoad);
    }

    function onLoad() {
        process_motors();
        process_servos();
        finalize();
    } 

    function update_arm_status() {
        self.armed = FC.isModeEnabled('ARM');
    }

    function initSensorData() {
        for (var i = 0; i < 3; i++) {
            SENSOR_DATA.accelerometer[i] = 0;
        }
    }

    function initDataArray(length) {
        var data = new Array(length);
        for (var i = 0; i < length; i++) {
            data[i] = [];
            data[i].min = -1;
            data[i].max = 1;
        }
        return data;
    }

    function addSampleToData(data, sampleNumber, sensorData) {
        for (var i = 0; i < data.length; i++) {
            var dataPoint = sensorData[i];
            data[i].push([sampleNumber, dataPoint]);
            if (dataPoint < data[i].min) {
                data[i].min = dataPoint;
            }
            if (dataPoint > data[i].max) {
                data[i].max = dataPoint;
            }
        }
        while (data[0].length > 40) {
            for (i = 0; i < data.length; i++) {
                data[i].shift();
            }
        }
        return sampleNumber + 1;
    }

    function update_model(val) {
        if (MIXER_CONFIG.appliedMixerPreset == -1) return; 

        $('.mixerPreview img').attr('src', './resources/motor_order/'
            + helper.mixer.getById(val).image + '.svg');
    }

    function process_servos() {

        let $tabServos = $(".tab-servos"),
            $servoEmptyTableInfo = $('#servoEmptyTableInfo'),
            $servoConfigTableContainer = $('#servo-config-table-container'),
            $servoConfigTable = $('#servo-config-table');

        if (SERVO_CONFIG.length == 0) {
            $tabServos.addClass("is-hidden");
            return;
        }

        function renderServos(name, alternate, obj) {

            $servoConfigTable.append('\
                <tr> \
                    <td class="text-center">' + name + '</td>\
                    <td class="middle"><input type="number" min="500" max="2500" value="' + SERVO_CONFIG[obj].middle + '" /></td>\
                    <td class="min"><input type="number" min="500" max="2500" value="' + SERVO_CONFIG[obj].min + '" /></td>\
                    <td class="max"><input type="number" min="500" max="2500" value="' + SERVO_CONFIG[obj].max + '" /></td>\
                    <td class="text-center rate">\
                    <td class="text-center reverse">\
                    </td>\
                </tr> \
            ');

            let $currentRow = $servoConfigTable.find('tr:last');

            //This routine is pre 2.0 only
            if (SERVO_CONFIG[obj].indexOfChannelToForward >= 0) {
                $currentRow.find('td.channel input').eq(SERVO_CONFIG[obj].indexOfChannelToForward).prop('checked', true);
            }

            // adding select box and generating options
            $currentRow.find('td.rate').append(
                '<input class="rate-input" type="number" min="' + FC.MIN_SERVO_RATE + '" max="' + FC.MAX_SERVO_RATE + '" value="' + Math.abs(SERVO_CONFIG[obj].rate) + '" />'
            );

            $currentRow.find('td.reverse').append(
                '<input type="checkbox" class="reverse-input togglemedium" ' + (SERVO_CONFIG[obj].rate < 0 ? ' checked ' :  '') + '/>'
            );

            $currentRow.data('info', { 'obj': obj });

            $currentRow.append('<td class="text-center output"></td>');

            let output,
                outputString;

            if (MIXER_CONFIG.platformType == PLATFORM_MULTIROTOR || MIXER_CONFIG.platformType == PLATFORM_TRICOPTER) {
                output = OUTPUT_MAPPING.getMrServoOutput(usedServoIndex);
            } else {
                output = OUTPUT_MAPPING.getFwServoOutput(usedServoIndex);
            }

            if (output === null) {
                outputString = "-";
            } else {
                outputString = "S" + output;
            }

            $currentRow.find('.output').html(outputString);
            //For 2.0 and above hide a row when servo is not configured
            if (!SERVO_RULES.isServoConfigured(obj)) {
                $currentRow.hide();
            } else {
                usedServoIndex++;
            }
        }

        function servos_update() {
            $servoConfigTable.find('tr:not(".main")').each(function () {
                var info = $(this).data('info');

                var selection = $('.channel input', this);
                var channelIndex = parseInt(selection.index(selection.filter(':checked')));
                if (channelIndex == -1) {
                    channelIndex = undefined;
                }

                SERVO_CONFIG[info.obj].indexOfChannelToForward = channelIndex;

                SERVO_CONFIG[info.obj].middle = parseInt($('.middle input', this).val());
                SERVO_CONFIG[info.obj].min = parseInt($('.min input', this).val());
                SERVO_CONFIG[info.obj].max = parseInt($('.max input', this).val());
                var rate = parseInt($('.rate-input', this).val());
                if ($('.reverse-input', this).is(':checked')) {
                    rate = -rate;
                }
                SERVO_CONFIG[info.obj].rate = rate;
            });

            //Save configuration to FC
            saveChainer.execute();
        }

        // drop previous table
        $servoConfigTable.find('tr:not(:first)').remove();

        let usedServoIndex = 0;

        for (let servoIndex = 0; servoIndex < SERVO_RULES.getServoCount(); servoIndex++) {
            renderServos('Servo ' + servoIndex, '', servoIndex);
        }
        if (usedServoIndex == 0) {
            // No servos configured
            $servoEmptyTableInfo.show();
            $servoConfigTableContainer.hide();
        } else {
            $servoEmptyTableInfo.hide();
            $servoConfigTableContainer.show();
        }

        // UI hooks for dynamically generated elements
        $('table.directions select, table.directions input, #servo-config-table select, #servo-config-table input').change(function () {
            if ($('div.live input').is(':checked')) {
                // apply small delay as there seems to be some funky update business going wrong
                helper.timeout.add('servos_update', servos_update, 10);
            }
        });

        $('a.update').click(function () {
            servos_update();
        });

    }

    function process_motors() {
        $motorsEnableTestMode = $('#motorsEnableTestMode');

        self.feature3DEnabled = bit_check(BF_CONFIG.features, 12);

        if (self.feature3DEnabled && !self.feature3DSupported) {
            self.allowTestMode = false;
        }

        $motorsEnableTestMode.prop('checked', false);
        $motorsEnableTestMode.prop('disabled', true);

        if (FC.isNewMixer()) {
            update_model(MIXER_CONFIG.appliedMixerPreset);
        } else {
            update_model(BF_CONFIG.mixerConfiguration);
        }

        // Always start with default/empty sensor data array, clean slate all
        initSensorData();

        // Setup variables
        var samples_accel_i = 0,
            accel_data = initDataArray(3),
            accel_max_read = [0, 0, 0],
            accel_offset = [0, 0, 0],
            accel_offset_established = false;

        let $rmsHelper = $(".acc-rms"),
            $currentHelper = $(".current-current"),
            $voltageHelper = $(".current-voltage");

        // timer initialization
        helper.interval.killAll(['motor_and_status_pull', 'global_data_refresh', 'msp-load-update']);
        helper.mspBalancedInterval.flush();

        helper.interval.add('IMU_pull', function () {

            /*
            * Enable balancer
            */
            if (helper.mspQueue.shouldDrop()) {
                update_accel_graph();
                return;
            }

            MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, update_accel_graph);
        }, 25, true);

        helper.interval.add('ANALOG_pull', function () {
            $currentHelper.html(ANALOG.amperage.toFixed(2));
            $voltageHelper.html(ANALOG.voltage.toFixed(2));
        }, 100, true);

        function update_accel_graph() {

            if (!accel_offset_established) {
                for (var i = 0; i < 3; i++) {
                    accel_offset[i] = SENSOR_DATA.accelerometer[i] * -1;
                }

                accel_offset_established = true;
            }

            var accel_with_offset = [
                accel_offset[0] + SENSOR_DATA.accelerometer[0],
                accel_offset[1] + SENSOR_DATA.accelerometer[1],
                accel_offset[2] + SENSOR_DATA.accelerometer[2]
            ];

            samples_accel_i = addSampleToData(accel_data, samples_accel_i, accel_with_offset);

            // Compute RMS of acceleration in displayed period of time
            // This is particularly useful for motor balancing as it 
            // eliminates the need for external tools
            var sum = 0.0;
            for (var j = 0; j < accel_data.length; j++)
                for (var k = 0; k < accel_data[j].length; k++)
                    sum += accel_data[j][k][1]*accel_data[j][k][1];

            let rms = Math.sqrt(sum/(accel_data[0].length+accel_data[1].length+accel_data[2].length));
            $rmsHelper.text(rms.toFixed(4));

            for (var i = 0; i < 3; i++) {
                if (Math.abs(accel_with_offset[i]) > Math.abs(accel_max_read[i])) accel_max_read[i] = accel_with_offset[i];
            }
        }

        let motors_wrapper = $('.motors .bar-wrapper'),
            servos_wrapper = $('.servos .bar-wrapper'),
            $motorTitles = $('.motor-titles'),
            $motorSliders = $('.motor-sliders'),
            $motorValues = $('.motor-values');

        for (let i = 0; i < MOTOR_RULES.getNumberOfConfiguredMotors(); i++) {
            const motorNumber = i + 1;
            motors_wrapper.append('\
                <div class="m-block motor-' + i + '">\
                    <div class="meter-bar">\
                        <div class="label"></div>\
                        <div class="indicator">\
                            <div class="label">\
                                <div class="label"></div>\
                            </div>\
                        </div>\
                    </div>\
                </div>\
            ');
            $motorTitles.append('<li title="Motor - ' + motorNumber + '">' + motorNumber + '</li>');
            $motorSliders.append('<div class="motor-slider-container"><input type="range" min="1000" max="2000" value="1000" disabled="disabled"/></div>');
            $motorValues.append('<li>1000</li>');
        }

        $motorSliders.append('<div class="motor-slider-container"><input type="range" min="1000" max="2000" value="1000" disabled="disabled" class="master"/></div>');
        $motorValues.append('<li style="font-weight: bold" data-i18n="motorsMaster"></li>');

        for (let i = 0; i < SERVO_RULES.getServoCount(); i++) {

            let opacity = "";
            if (!SERVO_RULES.isServoConfigured(15 - i)) {
                opacity = ' style="opacity: 0.2"';
            }

            servos_wrapper.append('\
                <div class="m-block servo-' + (15 - i) + '" ' + opacity + '>\
                    <div class="meter-bar">\
                        <div class="label"></div>\
                        <div class="indicator">\
                            <div class="label">\
                                <div class="label"></div>\
                            </div>\
                        </div>\
                    </div>\
                </div>\
            ');
        }

        var $slidersInput = $('div.sliders input');

        $slidersInput.prop('min', MISC.mincommand);
        $slidersInput.prop('max', MISC.maxthrottle);
        $('div.values li:not(:last)').text(MISC.mincommand);
        
        if(self.feature3DEnabled && self.feature3DSupported) {
            //Arbitrary sanity checks
            //Note: values may need to be revisited
            if(_3D.neutral3d > 1575 || _3D.neutral3d < 1425)
                _3D.neutral3d = 1500;

            $slidersInput.val(_3D.neutral3d);
        } else {
            $slidersInput.val(MISC.mincommand);
        }

        if(self.allowTestMode){ 
           // UI hooks
           var buffering_set_motor = [],
           buffer_delay = false;
           $('div.sliders input:not(.master)').on('input', function () {
            
               var index = $('div.sliders input:not(.master)').index(this),
               buffer = [],
               i;

               $('div.values li').eq(index).text($(this).val());

               for (i = 0; i < 8; i++) {
               var val = parseInt($('div.sliders input').eq(i).val());

               buffer.push(lowByte(val));
               buffer.push(highByte(val));
               }
             
               buffering_set_motor.push(buffer);

               if (!buffer_delay) {
                   buffer_delay = setTimeout(function () {
                       buffer = buffering_set_motor.pop();
                    
                       MSP.send_message(MSPCodes.MSP_SET_MOTOR, buffer);

                       buffering_set_motor = [];
                       buffer_delay = false;
                   }, 10);
               }
           });  
        }

        $('div.sliders input.master').on('input', function () {
            var val = $(this).val();

            $('div.sliders input:not(:disabled, :last)').val(val);
            $('div.values li:not(:last)').slice(0, MOTOR_RULES.getNumberOfConfiguredMotors()).text(val);
            $('div.sliders input:not(:last):first').trigger('input');
        });

        $motorsEnableTestMode.change(function () {
            if ($(this).is(':checked')) {
                $slidersInput.slice(0, MOTOR_RULES.getNumberOfConfiguredMotors()).prop('disabled', false);

                // unlock master slider
                $('div.sliders input:last').prop('disabled', false);
            } else {
                // disable sliders / min max
                $slidersInput.prop('disabled', true);

                // change all values to default
                if (self.feature3DEnabled && self.feature3DSupported) {
                    $slidersInput.val(_3D.neutral3d);
                } else {
                    $slidersInput.val(MISC.mincommand);
                }

                $slidersInput.trigger('input');
            }
        });

        // check if motors are already spinning
        var motors_running = false;

        for (var i = 0; i < MOTOR_RULES.getNumberOfConfiguredMotors(); i++) {
            if( !self.feature3DEnabled ){
                if (MOTOR_DATA[i] > MISC.mincommand) {
                    motors_running = true;
                    break;
                }
            }else{
                if( (MOTOR_DATA[i] < _3D.deadband3d_low) || (MOTOR_DATA[i] > _3D.deadband3d_high) ){
                    motors_running = true;
                    break;
                }
            } 
        }

        if (motors_running) {
            if (!self.armed && self.allowTestMode) {
                $motorsEnableTestMode.prop('checked', true);
            }
            // motors are running adjust sliders to current values

            var sliders = $('div.sliders input:not(.master)');

            var master_value = MOTOR_DATA[0];
            for (var i = 0; i < MOTOR_DATA.length; i++) {
                if (MOTOR_DATA[i] > 0) {
                    sliders.eq(i).val(MOTOR_DATA[i]);

                    if (master_value != MOTOR_DATA[i]) {
                        master_value = false;
                    }
                }
            }

            // only fire events when all values are set
            sliders.trigger('input');

            // slide master slider if condition is valid
            if (master_value) {
                $('div.sliders input.master').val(master_value);
                $('div.sliders input.master').trigger('input');
            }
        }

        $motorsEnableTestMode.change();
        
        function getPeriodicMotorOutput() {

            if (helper.mspQueue.shouldDrop()) {
                getPeriodicServoOutput();
                return;
            }

            MSP.send_message(MSPCodes.MSP_MOTOR, false, false, getPeriodicServoOutput);
        }

        function getPeriodicServoOutput() {
            if (helper.mspQueue.shouldDrop()) {
                update_ui();
                return;
            }

            MSP.send_message(MSPCodes.MSP_SERVO, false, false, update_ui);
        }

        var full_block_scale = MISC.maxthrottle - MISC.mincommand;
        
        function update_ui() {
            var previousArmState = self.armed,
                block_height = $('div.m-block:first').height(),
                data,
                margin_top,
                height,
                color,
                i;

            for (i = 0; i < MOTOR_DATA.length; i++) {
                data = MOTOR_DATA[i] - MISC.mincommand;
                margin_top = block_height - (data * (block_height / full_block_scale)).clamp(0, block_height);
                height = (data * (block_height / full_block_scale)).clamp(0, block_height);
                color = parseInt(data * 0.009);

                $('.motor-' + i + ' .label', motors_wrapper).text(MOTOR_DATA[i]);
                $('.motor-' + i + ' .indicator', motors_wrapper).css({'margin-top' : margin_top + 'px', 'height' : height + 'px', 'background-color' : '#37a8db'+ color +')'});
            }

            // servo indicators are still using old (not flexible block scale), it will be changed in the future accordingly
            for (i = 0; i < SERVO_DATA.length; i++) {
                data = SERVO_DATA[i] - 1000;
                margin_top = block_height - (data * (block_height / 1000)).clamp(0, block_height);
                height = (data * (block_height / 1000)).clamp(0, block_height);
                color = parseInt(data * 0.009);

                $('.servo-' + i + ' .label', servos_wrapper).text(SERVO_DATA[i]);
                $('.servo-' + i + ' .indicator', servos_wrapper).css({'margin-top' : margin_top + 'px', 'height' : height + 'px', 'background-color' : '#37a8db'+ color +')'});
            }
            //keep the following here so at least we get a visual cue of our motor setup
            update_arm_status();                        
            if (!self.allowTestMode) return;
            
            if (self.armed) {
                $motorsEnableTestMode.prop('disabled', true);
                $motorsEnableTestMode.prop('checked', false);
            } else {
                if (self.allowTestMode) {
                    $motorsEnableTestMode.prop('disabled', false);
                }
            }

            if (previousArmState != self.armed) {
                console.log('arm state change detected');
                $motorsEnableTestMode.change();
            }
        }

        // enable Status and Motor data pulling
        helper.interval.add('motor_and_status_pull', getPeriodicMotorOutput, 75, true);
    }

    function finalize() {
        localize();
        GUI.content_ready(callback);
    }

};

TABS.motors.cleanup = function (callback) {
    if (callback) callback();
};
