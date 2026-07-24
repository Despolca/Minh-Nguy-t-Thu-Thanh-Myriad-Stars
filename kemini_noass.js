const Config = z
  .object({
    user: z.string().default('Human'),
    assistant: z.string().default('Assistant'),
    example_user: z.string().default('H'),
    example_assistant: z.string().default('A'),
    system: z.string().default('SYSTEM'),
    separator: z.string().default(''),
    separator_system: z.string().default(''),
    prefill_user: z.string().default('Continue the conversation.'),
    capture_enabled: z.boolean().default(true),
    capture_rules: z.array(z.any()).default([]),
    stored_data: z.any().default({}),
  })
  .prefault({});

// Lấy dữ liệu lưu trữ
function getStoredData() {
  const data = Config.parse(getVariables({ type: 'script', script_id: getScriptId() }));
  insertVariables(data, { type: 'script', script_id: getScriptId() });
  return _.get(data, 'stored_data', {});
}

// Lưu dữ liệu lưu trữ
function saveStoredData(data) {
  updateVariablesWith(
    variables => {
      _.set(variables, 'stored_data', data);
      return variables;
    },
    { type: 'script', script_id: getScriptId() },
  );
}

function onSettingButtonClick() {
  let root = document.createElement('div');
  root.setAttribute('class', 'merge_editor');

  const tips = document.createElement('h3');
  {
    root.appendChild(tips);
    tips.setAttribute('class', 'flex-container justifyCenter alignItemsBaseline');
    const strong = document.createElement('strong');
    strong.appendChild(document.createTextNode('merge Config'));
    tips.appendChild(strong);

    const small = document.createElement('small');
    small.setAttribute('class', 'flex-container extensions_info');
    small.appendChild(document.createTextNode('Đoạn mã này là một phần trong https://github.com/teralomaniac/clewd.'));
    small.setAttribute('style', 'margin-top: 20px');
    root.appendChild(small);
    const hr = document.createElement('hr');
    root.appendChild(hr);
  }

  const content = document.createElement('div');
  {
    root.appendChild(content);
    content.setAttribute('class', 'flex-container flexFlowColumn');
    const width120 = 150;

    // Các mục cấu hình ban đầu
    [
      'user',
      'assistant',
      'example_user',
      'example_assistant',
      'system',
      'separator',
      'separator_system',
      'prefill_user',
    ].forEach(function (item) {
      const row = document.createElement('div');
      {
        content.appendChild(row);
        row.setAttribute('class', 'flex-container');
        const box = document.createElement('div');
        {
          box.setAttribute('class', 'flex1 flex-container');
          const label = document.createElement('label');
          label.setAttribute('class', 'title_restorable');
          label.setAttribute('style', 'width: ' + width120 + 'px; justify-content: flex-end; padding-right: 10px;');
          const small = document.createElement('small');
          small.appendChild(document.createTextNode(item + ': '));
          label.appendChild(small);
          box.appendChild(label);
          const div = document.createElement('div');
          const input = document.createElement('input');
          input.setAttribute('class', 'config_' + item + ' text_pole textarea_compact');
          div.appendChild(input);
          box.appendChild(div);
          row.appendChild(box);
        }
      }
    });

    // Thêm mới: Công tắc bắt dữ liệu toàn cục
    const globalSwitchRow = document.createElement('div');
    globalSwitchRow.setAttribute('class', 'flex-container');
    globalSwitchRow.setAttribute(
      'style',
      'margin-top: 20px; margin-bottom: 10px; padding: 10px; background-color: #f5f5f5; border-radius: 5px;',
    );

    const switchLabel = document.createElement('label');
    switchLabel.setAttribute('class', 'title_restorable');
    switchLabel.setAttribute(
      'style',
      'width: ' + width120 + 'px; justify-content: flex-end; padding-right: 10px; align-items: center; display: flex;',
    );
    const switchLabelText = document.createElement('small');
    switchLabelText.appendChild(document.createTextNode('Chức năng bắt dữ liệu: '));
    switchLabel.appendChild(switchLabelText);

    const switchContainer = document.createElement('div');
    switchContainer.setAttribute('style', 'display: flex; align-items: center;');

    const globalSwitch = document.createElement('input');
    globalSwitch.setAttribute('type', 'checkbox');
    globalSwitch.setAttribute('class', 'config_capture_enabled');
    globalSwitch.setAttribute('id', 'global_capture_switch');

    const switchText = document.createElement('span');
    switchText.setAttribute('style', 'margin-left: 10px; font-weight: bold;');
    switchText.setAttribute('id', 'global_switch_text');

    // Hàm cập nhật văn bản của công tắc
    function updateSwitchText() {
      switchText.textContent = globalSwitch.checked ? 'Đã bật' : 'Đã tắt';
      switchText.style.color = globalSwitch.checked ? '#28a745' : '#dc3545';
    }

    globalSwitch.onchange = updateSwitchText;

    switchContainer.appendChild(globalSwitch);
    switchContainer.appendChild(switchText);

    globalSwitchRow.appendChild(switchLabel);
    globalSwitchRow.appendChild(switchContainer);
    content.appendChild(globalSwitchRow);

    // Khu vực cấu hình quy tắc bắt dữ liệu
    const captureSection = document.createElement('div');
    captureSection.setAttribute('style', 'margin-top: 20px; border-top: 1px solid #ccc; padding-top: 15px;');

    const captureTitle = document.createElement('h4');
    captureTitle.appendChild(document.createTextNode('Cấu hình quy tắc bắt dữ liệu'));
    captureSection.appendChild(captureTitle);

    // Thêm giải thích phạm vi
    const rangeHelp = document.createElement('p');
    rangeHelp.setAttribute('style', 'font-size: 12px; color: #666; margin: 5px 0;');
    rangeHelp.appendChild(
      document.createTextNode(
        'Định dạng phạm vi: +1 (Mục thứ 1), -1 (Mục từ dưới lên 1), +1~+3 (Từ mục 1 đến mục 3), +1,+3~+5,-2 (Mục 1 + từ mục 3 đến mục 5 + mục từ dưới lên 2)',
      ),
    );
    captureSection.appendChild(rangeHelp);

    var captureRulesContainer = document.createElement('div');
    captureRulesContainer.setAttribute('class', 'capture_rules_container');
    captureSection.appendChild(captureRulesContainer);

    // Thêm nút quy tắc
    const addRuleBtn = document.createElement('button');
    addRuleBtn.appendChild(document.createTextNode('Thêm quy tắc bắt'));
    addRuleBtn.setAttribute('type', 'button');
    addRuleBtn.setAttribute('class', 'menu_button');
    addRuleBtn.onclick = function () {
      addCaptureRuleRow(captureRulesContainer);
    };
    captureSection.appendChild(addRuleBtn);

    // Khu vực xem dữ liệu lưu trữ
    const storageSection = document.createElement('div');
    storageSection.setAttribute('style', 'margin-top: 20px; border-top: 1px solid #ccc; padding-top: 15px;');

    const storageTitle = document.createElement('h4');
    storageTitle.appendChild(document.createTextNode('Dữ liệu đã lưu trữ'));
    storageSection.appendChild(storageTitle);

    var storageContainer = document.createElement('div');
    storageContainer.setAttribute('class', 'storage_container');
    storageSection.appendChild(storageContainer);

    // Nút làm trống lưu trữ
    const clearStorageBtn = document.createElement('button');
    clearStorageBtn.appendChild(document.createTextNode('Làm trống toàn bộ dữ liệu lưu trữ'));
    clearStorageBtn.setAttribute('type', 'button');
    clearStorageBtn.setAttribute('class', 'menu_button');
    clearStorageBtn.onclick = function () {
      if (confirm('Bạn có chắc chắn muốn làm trống toàn bộ dữ liệu lưu trữ không?')) {
        saveStoredData({});
        updateStorageDisplay(storageContainer);
        toastr.info('Đã làm trống dữ liệu lưu trữ!');
      }
    };
    storageSection.appendChild(clearStorageBtn);

    content.appendChild(captureSection);
    content.appendChild(storageSection);
  }

  const config = getVariables({ type: 'script', script_id: getScriptId() });

  root = $(root);

  // Tải cấu hình ban đầu
  root.find('.config_user').val(config.user);
  root.find('.config_assistant').val(config.assistant);
  root.find('.config_example_user').val(config.example_user);
  root.find('.config_example_assistant').val(config.example_assistant);
  root.find('.config_system').val(config.system);
  root.find('.config_separator').val(config.separator);
  root.find('.config_separator_system').val(config.separator_system);
  root.find('.config_prefill_user').val(config.prefill_user);

  // Tải trạng thái công tắc toàn cục
  root.find('.config_capture_enabled').prop('checked', config.capture_enabled !== false);
  // Kích hoạt sự kiện change để cập nhật văn bản
  root.find('.config_capture_enabled').trigger('change');

  // Tải quy tắc bắt
  var captureRulesContainer = root.find('.capture_rules_container')[0];
  var storageContainer = root.find('.storage_container')[0];

  if (config.capture_rules && config.capture_rules.length > 0) {
    for (let i = 0; i < config.capture_rules.length; i++) {
      addCaptureRuleRow(captureRulesContainer, config.capture_rules[i]);
    }
  }

  // Hiển thị dữ liệu lưu trữ
  updateStorageDisplay(storageContainer);

  SillyTavern.callPopup(root, 'confirm', undefined, { okButton: 'Save' }).then(function (ok) {
    if (!ok) {
      return;
    }

    // Lưu cấu hình ban đầu
    config.user = root.find('.config_user').val();
    config.assistant = root.find('.config_assistant').val();
    config.example_user = root.find('.config_example_user').val();
    config.example_assistant = root.find('.config_example_assistant').val();
    config.system = root.find('.config_system').val();
    config.separator = root.find('.config_separator').val();
    config.separator_system = root.find('.config_separator_system').val();
    config.prefill_user = root.find('.config_prefill_user').val();

    // Lưu trạng thái công tắc toàn cục
    config.capture_enabled = root.find('.config_capture_enabled').prop('checked');

    // Lưu quy tắc bắt
    config.capture_rules = [];
    root.find('.capture_rule_row').each(function () {
      const $this = $(this);
      const enabled = $this.find('.rule_enabled').prop('checked');
      const regex = $this.find('.rule_regex').val();
      const tag = $this.find('.rule_tag').val();
      const updateMode = $this.find('.rule_update_mode').val();
      const range = $this.find('.rule_range').val();

      if (regex && tag) {
        config.capture_rules.push({
          enabled: enabled,
          regex: regex,
          tag: tag,
          updateMode: updateMode,
          range: range,
        });
      }
    });

    SillyTavern.extensionSettings[extensionName] = config;
    SillyTavern.saveSettingsDebounced();
    toastr.info('Lưu cấu hình thành công!');
  });
}

// Thêm dòng quy tắc bắt
function addCaptureRuleRow(container, rule) {
  rule = rule || null;
  const ruleRow = document.createElement('div');
  ruleRow.setAttribute('class', 'capture_rule_row flex-container');
  ruleRow.setAttribute(
    'style',
    'margin-bottom: 10px; align-items: center; padding: 10px; border: 1px solid #ddd; border-radius: 5px;',
  );

  // Thêm mới: Công tắc bật quy tắc
  const enabledDiv = document.createElement('div');
  enabledDiv.setAttribute('style', 'margin-right: 10px; display: flex; flex-direction: column; align-items: center;');
  const enabledLabel = document.createElement('label');
  enabledLabel.appendChild(document.createTextNode('Bật'));
  enabledLabel.setAttribute('style', 'font-size: 12px; margin-bottom: 5px;');
  const enabledSwitch = document.createElement('input');
  enabledSwitch.setAttribute('type', 'checkbox');
  enabledSwitch.setAttribute('class', 'rule_enabled');
  enabledSwitch.checked = rule ? rule.enabled !== false : true;

  // Thêm phản hồi thị giác khi công tắc thay đổi
  enabledSwitch.onchange = function () {
    if (enabledSwitch.checked) {
      ruleRow.style.backgroundColor = '';
      ruleRow.style.opacity = '1';
    } else {
      ruleRow.style.backgroundColor = '#f8f9fa';
      ruleRow.style.opacity = '0.7';
    }
  };

  enabledDiv.appendChild(enabledLabel);
  enabledDiv.appendChild(enabledSwitch);

  // Nhập biểu thức chính quy (Regex)
  const regexDiv = document.createElement('div');
  regexDiv.setAttribute('style', 'margin-right: 10px;');
  const regexLabel = document.createElement('label');
  regexLabel.appendChild(document.createTextNode('Regex: '));
  regexLabel.setAttribute('style', 'font-size: 12px; display: block;');
  const regexInput = document.createElement('input');
  regexInput.setAttribute('class', 'rule_regex');
  regexInput.setAttribute('placeholder', '/pattern/flags');
  regexInput.setAttribute('style', 'width: 250px;');
  regexInput.value = rule ? rule.regex : '';
  regexDiv.appendChild(regexLabel);
  regexDiv.appendChild(regexInput);

  // Nhập thẻ đánh dấu
  const tagDiv = document.createElement('div');
  tagDiv.setAttribute('style', 'margin-right: 10px;');
  const tagLabel = document.createElement('label');
  tagLabel.appendChild(document.createTextNode('Thẻ đánh dấu: '));
  tagLabel.setAttribute('style', 'font-size: 12px; display: block;');
  const tagInput = document.createElement('input');
  tagInput.setAttribute('class', 'rule_tag');
  tagInput.setAttribute('placeholder', '<tag>');
  tagInput.setAttribute('style', 'width: 100px;');
  tagInput.value = rule ? rule.tag : '';
  tagDiv.appendChild(tagLabel);
  tagDiv.appendChild(tagInput);

  // Chọn chế độ cập nhật
  const modeDiv = document.createElement('div');
  modeDiv.setAttribute('style', 'margin-right: 10px;');
  const modeLabel = document.createElement('label');
  modeLabel.appendChild(document.createTextNode('Chế độ: '));
  modeLabel.setAttribute('style', 'font-size: 12px; display: block;');
  const modeSelect = document.createElement('select');
  modeSelect.setAttribute('class', 'rule_update_mode');
  modeSelect.setAttribute('style', 'width: 80px;');
  const option1 = document.createElement('option');
  option1.value = 'accumulate';
  option1.appendChild(document.createTextNode('Kiểu xếp chồng'));
  const option2 = document.createElement('option');
  option2.value = 'replace';
  option2.appendChild(document.createTextNode('Kiểu thay thế'));
  modeSelect.appendChild(option1);
  modeSelect.appendChild(option2);
  modeSelect.value = rule ? rule.updateMode : 'accumulate';
  modeDiv.appendChild(modeLabel);
  modeDiv.appendChild(modeSelect);

  // Nhập phạm vi
  const rangeDiv = document.createElement('div');
  rangeDiv.setAttribute('style', 'margin-right: 10px;');
  const rangeLabel = document.createElement('label');
  rangeLabel.appendChild(document.createTextNode('Phạm vi: '));
  rangeLabel.setAttribute('style', 'font-size: 12px; display: block;');
  const rangeInput = document.createElement('input');
  rangeInput.setAttribute('class', 'rule_range');
  rangeInput.setAttribute('placeholder', '+1,+3~+5,-2');
  rangeInput.setAttribute('style', 'width: 120px;');
  rangeInput.value = rule ? rule.range : '';
  rangeDiv.appendChild(rangeLabel);
  rangeDiv.appendChild(rangeInput);

  // Nút xóa
  const deleteBtn = document.createElement('button');
  deleteBtn.appendChild(document.createTextNode('Xóa'));
  deleteBtn.setAttribute('type', 'button');
  deleteBtn.setAttribute('class', 'menu_button');
  deleteBtn.setAttribute('style', 'height: 30px; margin-top: 15px;');
  deleteBtn.onclick = function () {
    if (confirm('Bạn có chắc chắn muốn xóa quy tắc bắt này không?')) {
      container.removeChild(ruleRow);
    }
  };

  ruleRow.appendChild(enabledDiv);
  ruleRow.appendChild(regexDiv);
  ruleRow.appendChild(tagDiv);
  ruleRow.appendChild(modeDiv);
  ruleRow.appendChild(rangeDiv);
  ruleRow.appendChild(deleteBtn);

  container.appendChild(ruleRow);

  // Khởi tạo trạng thái thị giác
  enabledSwitch.onchange();
}

// Cập nhật hiển thị dữ liệu lưu trữ
function updateStorageDisplay(container) {
  container.innerHTML = '';

  const storedData = getStoredData();
  const keys = Object.keys(storedData);

  for (let i = 0; i < keys.length; i++) {
    const tag = keys[i];
    const storageItem = document.createElement('div');
    storageItem.setAttribute(
      'style',
      'margin-bottom: 15px; padding: 10px; border: 1px solid #ddd; border-radius: 5px;',
    );

    const title = document.createElement('h5');
    title.appendChild(document.createTextNode('Thẻ đánh dấu: ' + tag + ' (' + storedData[tag].length + ' mục dữ liệu)'));
    storageItem.appendChild(title);

    const content = document.createElement('textarea');
    content.setAttribute('class', 'stored_data_content');
    content.setAttribute('data-tag', tag);
    content.setAttribute('style', 'width: 100%; height: 150px; resize: vertical; font-family: monospace;');
    content.value = storedData[tag].join('\n---\n');
    storageItem.appendChild(content);

    const buttonRow = document.createElement('div');
    buttonRow.setAttribute('style', 'margin-top: 10px;');

    const saveBtn = document.createElement('button');
    saveBtn.appendChild(document.createTextNode('Lưu chỉnh sửa'));
    saveBtn.setAttribute('type', 'button');
    saveBtn.setAttribute('class', 'menu_button');
    saveBtn.setAttribute('style', 'margin-right: 10px;');
    saveBtn.onclick = (function (tagName, textarea) {
      return function () {
        const newContent = textarea.value.trim();
        if (newContent === '') {
          var currentData = getStoredData();
          delete currentData[tagName];
          saveStoredData(currentData);
        } else {
          const newDataArray = newContent
            .split(/\n---\n|\n-{3,}\n/)
            .map(function (item) {
              return item.trim();
            })
            .filter(function (item) {
              return item !== '';
            });
          var currentData = getStoredData();
          currentData[tagName] = newDataArray;
          saveStoredData(currentData);
        }
        updateStorageDisplay(container);
        toastr.info('Dữ liệu của thẻ ' + tagName + ' đã được lưu!');
      };
    })(tag, content);
    buttonRow.appendChild(saveBtn);

    const clearBtn = document.createElement('button');
    clearBtn.appendChild(document.createTextNode('Làm trống thẻ này'));
    clearBtn.setAttribute('type', 'button');
    clearBtn.setAttribute('class', 'menu_button');
    clearBtn.onclick = (function (tagName) {
      return function () {
        if (confirm('Bạn có chắc chắn muốn làm trống dữ liệu của thẻ ' + tagName + ' không?')) {
          const currentData = getStoredData();
          delete currentData[tagName];
          saveStoredData(currentData);
          updateStorageDisplay(container);
          toastr.info('Dữ liệu của thẻ ' + tagName + ' đã được làm trống!');
        }
      };
    })(tag);
    buttonRow.appendChild(clearBtn);

    storageItem.appendChild(buttonRow);
    container.appendChild(storageItem);
  }

  if (keys.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.appendChild(document.createTextNode('Hiện chưa có dữ liệu lưu trữ'));
    emptyMsg.setAttribute('style', 'color: #999; font-style: italic;');
    container.appendChild(emptyMsg);
  }
}

// Hàm xử lý và bắt dữ liệu - Thêm kiểm tra công tắc
function captureAndStoreData(content, rules, globalEnabled) {
  // Kiểm tra công tắc toàn cục
  if (!globalEnabled) {
    console.debug('Data capture is globally disabled');
    return;
  }

  const storedData = getStoredData();
  let hasChanges = false;

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];

    // Kiểm tra xem quy tắc đã bật chưa
    if (rule.enabled === false) {
      console.debug('Rule ' + rule.tag + ' is disabled, skipping');
      continue;
    }

    try {
      // Phân tích biểu thức chính quy
      const regexMatch = rule.regex.match(/^\/(.+)\/([gimsu]*)$/);
      if (!regexMatch) {
        console.warn('Invalid regex format: ' + rule.regex);
        continue;
      }

      const pattern = regexMatch[1];
      const flags = regexMatch[2];
      const regex = new RegExp(pattern, flags);

      // Đặt lại lastIndex của biểu thức chính quy để đảm bảo mỗi lần đều khớp từ đầu
      regex.lastIndex = 0;

      // Bắt dữ liệu khớp
      const matches = [];
      var match;
      if (flags.indexOf('g') !== -1) {
        while ((match = regex.exec(content)) !== null) {
          matches.push(match[0]);
          // Ngăn chặn vòng lặp vô hạn
          if (match.index === regex.lastIndex) {
            regex.lastIndex++;
          }
        }
      } else {
        match = regex.exec(content);
        if (match) {
          matches.push(match[0]);
        }
      }

      // Chỉ xử lý khi quy tắc hiện tại khớp với dữ liệu
      if (matches.length === 0) {
        console.debug('No matches found for rule: ' + rule.tag);
        continue;
      }

      console.debug('Rule ' + rule.tag + ' found ' + matches.length + ' matches:', matches);

      // Lọc dữ liệu dựa theo phạm vi
      let filteredMatches = matches;
      if (rule.range && rule.range.trim()) {
        filteredMatches = filterByRange(matches, rule.range.trim());
      }

      if (filteredMatches.length === 0) {
        console.debug('No matches after range filtering for rule: ' + rule.tag);
        continue;
      }

      // Xử lý dữ liệu dựa theo chế độ cập nhật
      if (rule.updateMode === 'replace') {
        // Kiểu thay thế: Thay thế trực tiếp
        storedData[rule.tag] = filteredMatches.slice();
        hasChanges = true;
        console.debug('Replaced data for tag ' + rule.tag + ':', filteredMatches);
      } else {
        // Kiểu xếp chồng: Xóa trùng lặp rồi thêm vào
        if (!storedData[rule.tag]) {
          storedData[rule.tag] = [];
        }

        const beforeCount = storedData[rule.tag].length;
        for (let j = 0; j < filteredMatches.length; j++) {
          const newData = filteredMatches[j];
          if (storedData[rule.tag].indexOf(newData) === -1) {
            storedData[rule.tag].push(newData);
            hasChanges = true;
          }
        }
        const afterCount = storedData[rule.tag].length;
        console.debug('Accumulated data for tag ' + rule.tag + ': ' + (afterCount - beforeCount) + ' new items added');
      }
    } catch (error) {
      console.error('Error processing capture rule for tag ' + rule.tag + ':', error);
    }
  }

  // Chỉ lưu lại khi có sự thay đổi
  if (hasChanges) {
    saveStoredData(storedData);
    console.debug('Stored data updated and saved');
  }
}

// Hàm lọc phạm vi được thiết kế lại, hỗ trợ chọn theo phân đoạn
function filterByRange(array, rangeStr) {
  try {
    const result = [];
    const segments = rangeStr.split(',');

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i].trim();
      if (!segment) continue;

      if (segment.indexOf('~') !== -1) {
        // Định dạng phạm vi: +1~+3, -5~-1 v.v.
        const rangeParts = segment.split('~');
        const start = rangeParts[0].trim();
        const end = rangeParts[1].trim();
        let startIndex = parseRangeIndex(start, array.length);
        let endIndex = parseRangeIndex(end, array.length);

        if (startIndex > endIndex) {
          const temp = startIndex;
          startIndex = endIndex;
          endIndex = temp;
        }

        for (let j = startIndex; j <= endIndex && j < array.length; j++) {
          if (j >= 0 && result.indexOf(array[j]) === -1) {
            result.push(array[j]);
          }
        }
      } else {
        // Chỉ mục đơn: +1, -1 v.v.
        const index = parseRangeIndex(segment, array.length);
        if (index >= 0 && index < array.length && result.indexOf(array[index]) === -1) {
          result.push(array[index]);
        }
      }
    }

    return result;
  } catch (error) {
    console.warn('Invalid range format: ' + rangeStr, error);
    return array;
  }
}

// Phân tích chỉ mục phạm vi
function parseRangeIndex(indexStr, arrayLength) {
  indexStr = indexStr.trim();
  if (indexStr.charAt(0) === '+') {
    // Chỉ mục số dương: +1 biểu thị cái đầu tiên (chỉ mục 0)
    return parseInt(indexStr.substring(1)) - 1;
  } else if (indexStr.charAt(0) === '-') {
    // Chỉ mục số âm: -1 biểu thị cái đầu tiên đếm từ dưới lên
    return arrayLength + parseInt(indexStr);
  } else {
    // Số thuần túy, xử lý theo số dương
    return parseInt(indexStr) - 1;
  }
}

// Hàm thay thế thẻ đánh dấu
function replaceTagsWithStoredData(content) {
  const storedData = getStoredData();
  const keys = Object.keys(storedData);

  for (let i = 0; i < keys.length; i++) {
    const tag = keys[i];
    if (content.indexOf(tag) !== -1 && storedData[tag].length > 0) {
      const replacement = storedData[tag].join('\n');
      const escapedTag = escapeRegExp(tag);
      const replaceRegex = new RegExp(escapedTag, 'g');
      content = content.replace(replaceRegex, replacement);
      console.debug('Replaced tag ' + tag + ' with ' + storedData[tag].length + ' stored items');
    }
  }
  return content;
}

// Thoát các ký tự đặc biệt của biểu thức chính quy
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- Helper function to process a block of messages meant for merging ---
function processAndAddMergeBlock(config, blockToMerge, targetArray) {
  if (!blockToMerge || blockToMerge.length === 0) {
    return; // Nothing to process
  }

  // Bắt dữ liệu trước khi xử lý - Thêm kiểm tra công tắc
  if (config.capture_enabled !== false && config.capture_rules && config.capture_rules.length > 0) {
    let combinedContent = '';
    for (let i = 0; i < blockToMerge.length; i++) {
      if (blockToMerge[i].content) {
        combinedContent += (combinedContent ? '\n\n' : '') + blockToMerge[i].content;
      }
    }
    console.debug('merge config >>> Content before capture:', combinedContent.substring(0, 200) + '...');
    captureAndStoreData(combinedContent, config.capture_rules, config.capture_enabled);
  } else {
    console.debug('merge config >>> Data capture is disabled or no rules configured');
  }

  // Process the collected block using the original 'process' function
  const mergedAssistantMessage = process(config, blockToMerge);

  console.debug('merge config >>>>>>>>>>>>> Processing Block for Merging <<<<<<<<<<<<<<<<<');

  // Tiến hành thay thế thẻ đánh dấu ngay sau khi gộp
  if (mergedAssistantMessage && mergedAssistantMessage.content) {
    const beforeReplacement = mergedAssistantMessage.content;
    mergedAssistantMessage.content = replaceTagsWithStoredData(mergedAssistantMessage.content);

    if (beforeReplacement !== mergedAssistantMessage.content) {
      console.debug('merge config >>> Tags were replaced in merged content');
    }
  }

  // Bây giờ xuất ra là nội dung cuối cùng sau khi thay thế thẻ đánh dấu
  console.debug('merge config >>> Merged Content (After Tag Replacement):', mergedAssistantMessage.content);

  let systemMessage = null;
  // Handle potential system prompt extraction from the *merged* content
  if (config.separator_system) {
    const systemIndex = mergedAssistantMessage.content.indexOf(config.separator_system);
    if (systemIndex > 0) {
      const systemContent = mergedAssistantMessage.content.substr(0, systemIndex + config.separator_system.length);
      // Modify the merged assistant message content to remove the system part
      mergedAssistantMessage.content = mergedAssistantMessage.content.substr(
        systemIndex + config.separator_system.length,
      );
      // Create a separate system message
      systemMessage = { role: 'system', content: systemContent };
      console.debug('merge config >>> Extracted System Message:', systemContent);
    }
  }

  // Add extracted system message FIRST for this block (if it exists)
  if (systemMessage) {
    targetArray.push(systemMessage);
  }

  // Add the prefill user message and assistant message pair (if assistant has content)
  if (mergedAssistantMessage && mergedAssistantMessage.content.trim()) {
    // Đưa tin nhắn sau khi gộp vào vai 'user'
    mergedAssistantMessage.role = 'user';
    targetArray.push(mergedAssistantMessage);
  }
}

// --- Helper function to handle system message separation for preserved messages ---
function processPreservedSystemMessage(config, message, targetArray) {
  let systemMessage = null;
  let remainingContent = message.content;

  // Handle potential system prompt extraction from preserved content
  if (config.separator_system && message.role === 'system') {
    const systemIndex = remainingContent.indexOf(config.separator_system);
    if (systemIndex > 0) {
      const systemContent = remainingContent.substr(0, systemIndex + config.separator_system.length);
      remainingContent = remainingContent.substr(systemIndex + config.separator_system.length).trim();

      // Create a separate system message for the extracted part
      systemMessage = { role: 'system', content: systemContent };
      console.debug('merge config >>> Extracted System Message from preserved:', systemContent);
    }
  }

  // Add extracted system message first (if it exists)
  if (systemMessage) {
    targetArray.push(systemMessage);
  }

  // Add the remaining content as the original message (if any content remains)
  if (remainingContent) {
    const preservedMessage = {
      role: message.role,
      content: remainingContent,
    };
    if (message.name) preservedMessage.name = message.name;
    targetArray.push(preservedMessage);
    console.debug(
      'merge config >>> Preserving message (tag removed, system processed):',
      preservedMessage.role,
      preservedMessage.content.substring(0, 50) + '...',
    );
  } else if (!systemMessage) {
    // If no system message was extracted and no content remains, still add the original
    targetArray.push(message);
    console.debug(
      'merge config >>> Preserving message (tag removed, no system processing):',
      message.role,
      message.content.substring(0, 50) + '...',
    );
  }
}
// --- End of helper function ---

eventOn(tavern_events.CHAT_COMPLETION_SETTINGS_READY, function (completion) {
  console.log('script.event_types.CHAT_COMPLETION_SETTINGS_READY triggered');
  if (SillyTavern.mainApi !== 'openai') {
    console.log('Not an OpenAI API, skipping merge processing.');
    return;
  }
  const config = getVariables({ type: 'script', script_id: getScriptId() });
  const NO_TRANS_TAG = '<|no-trans|>'; // Define the tag

  const originalMessages = completion.messages;
  const finalMessages = [];
  let currentMergeBlock = []; // Accumulates messages to be merged

  console.debug('Original messages:', JSON.stringify(originalMessages, null, 2));
  console.debug('Data capture global switch:', config.capture_enabled !== false ? 'Enabled' : 'Disabled');

  // Iterate through original messages to build the final list in order
  for (let i = 0; i < originalMessages.length; i++) {
    const message = originalMessages[i];
    if (message.content && message.content.indexOf(NO_TRANS_TAG) !== -1) {
      // 1. Process any pending messages in the current merge block
      processAndAddMergeBlock(config, currentMergeBlock, finalMessages);
      currentMergeBlock = []; // Reset the block

      // 2. Process the current message (remove tag and handle system separation)
      const messageWithoutTag = {
        role: message.role,
        content: message.content.replace(NO_TRANS_TAG, '').trim(),
      };
      if (message.name) messageWithoutTag.name = message.name;

      // Only process if content remains after tag removal
      if (messageWithoutTag.content) {
        processPreservedSystemMessage(config, messageWithoutTag, finalMessages);
      } else {
        console.debug(
          'merge config >>> Skipping preserved message as content is empty after tag removal:',
          message.role,
        );
      }
    } else {
      // Add this message to the current block waiting to be merged
      currentMergeBlock.push(message);
      console.debug('merge config >>> Added message to current merge block:', message.role);
    }
  }

  // After the loop, process any remaining messages in the last merge block
  processAndAddMergeBlock(config, currentMergeBlock, finalMessages);

  // Sau khi tất cả quá trình xử lý hoàn tất, tiến hành thay thế thẻ đánh dấu cho các tin nhắn được giữ lại
  for (let i = 0; i < finalMessages.length; i++) {
    if (finalMessages[i].content) {
      const beforeReplacement = finalMessages[i].content;
      finalMessages[i].content = replaceTagsWithStoredData(finalMessages[i].content);
      if (beforeReplacement !== finalMessages[i].content) {
        console.debug('merge config >>> Tags were replaced in final message ' + i);
      }
    }
  }

  // Replace the original completion messages
  completion.messages = finalMessages;

  console.debug(
    'merge config >>>>>>>>>>>>> Final Message Structure <<<<<<<<<<<<<<<<<\n',
    JSON.stringify(completion.messages, null, 2),
  );
});

SillyTavern.SlashCommandParser.addCommandObject(
  SillyTavern.SlashCommand.fromProps({
    name: 'kemini',
    callback: onSettingButtonClick,
  }),
);

// ==============================================
// The 'process' function - Khôi phục logic xử lý biểu thức chính quy ban đầu
// ==============================================

function process(prefixs, messages) {
  prefixs = prefixs || defaultConfig;

  const HyperProcess = function (system, messages, claudeMode) {
    const hyperMerge = function (content, mergeDisable) {
      const splitContent = content.split(
        new RegExp('\\n\\n(' + prefixs['assistant'] + '|' + prefixs['user'] + '|' + prefixs['system'] + '):', 'g'),
      );
      content =
        splitContent[0] +
        splitContent.slice(1).reduce(function (acc, current, index, array) {
          const merge =
            index > 1 &&
            current === array[index - 2] &&
            ((current === prefixs['user'] && !mergeDisable.user) ||
              (current === prefixs['assistant'] && !mergeDisable.assistant) ||
              (current === prefixs['system'] && !mergeDisable.system));
          return acc + (index % 2 !== 0 ? current.trim() : '\n\n' + (merge ? '' : current + ': '));
        }, '');
      return content;
    };

    const hyperRegex = function (content, order) {
      let regexLog = '';
      const regexPattern =
        '<regex(?: +order *= *' +
        order +
        ')' +
        (order === 2 ? '?' : '') +
        '> *"(/?)(.*)\\1(.*?)" *: *"(.*?)" *</regex>';
      const matches = content.match(new RegExp(regexPattern, 'gm'));

      if (matches) {
        for (let i = 0; i < matches.length; i++) {
          const match = matches[i];
          try {
            const reg = /<regex(?: +order *= *\d)?> *"(\/?)(.*)\1(.*?)" *: *"(.*?)" *<\/regex>/.exec(match);
            regexLog += match + '\n';
            const replacePattern = new RegExp(reg[2], reg[3]);
            const replacement = JSON.parse('"' + reg[4].replace(/\\?"/g, '\\"') + '"');
            content = content.replace(replacePattern, replacement);
          } catch (e) {
            console.warn('Regex processing error:', e);
          }
        }
      }
      return [content, regexLog];
    };

    const HyperPmtProcess = function (content) {
      const regex1 = hyperRegex(content, 1);
      content = regex1[0];
      regexLogs += regex1[1];

      const mergeDisable = {
        all: content.indexOf('<|Merge Disable|>') !== -1,
        system: content.indexOf('<|Merge System Disable|>') !== -1,
        user: content.indexOf('<|Merge Human Disable|>') !== -1,
        assistant: content.indexOf('<|Merge Assistant Disable|>') !== -1,
      };

      const systemPattern1 = new RegExp(
        '(\\n\\n|^\\s*)(?<!\\n\\n(' +
          prefixs['user'] +
          '|' +
          prefixs['assistant'] +
          '):.*?)' +
          prefixs['system'] +
          ':\\s*',
        'gs',
      );
      const systemPattern2 = new RegExp('(\\n\\n|^\\s*)' + prefixs['system'] + ': *', 'g');

      content = content
        .replace(systemPattern1, '$1')
        .replace(
          systemPattern2,
          mergeDisable.all || mergeDisable.user || mergeDisable.system ? '$1' : '\n\n' + prefixs['user'] + ': ',
        );
      content = hyperMerge(content, mergeDisable);

      const splitPattern = new RegExp('\\n\\n(?=' + prefixs['assistant'] + ':|' + prefixs['user'] + ':)', 'g');
      const splitContent = content.split(splitPattern);

      let match;
      const atPattern = /<@(\d+)>(.*?)<\/@\1>/gs;
      while ((match = atPattern.exec(content)) !== null) {
        const index = splitContent.length - parseInt(match[1]) - 1;
        if (index >= 0) {
          splitContent[index] += '\n\n' + match[2];
        }
        content = content.replace(match[0], '');
      }

      content = splitContent.join('\n\n').replace(/<@(\d+)>.*?<\/@\1>/gs, '');

      const regex2 = hyperRegex(content, 2);
      content = regex2[0];
      regexLogs += regex2[1];
      content = hyperMerge(content, mergeDisable);

      const regex3 = hyperRegex(content, 3);
      content = regex3[0];
      regexLogs += regex3[1];

      content = content
        .replace(/<regex( +order *= *\d)?>.*?<\/regex>/gm, '')
        .replace(/\r\n|\r/gm, '\n')
        .replace(/\s*<\|curtail\|>\s*/g, '\n')
        .replace(/\s*<\|join\|>\s*/g, '')
        .replace(/\s*<\|space\|>\s*/g, ' ')
        .replace(/<\|(\\.*?)\|>/g, function (match, p1) {
          try {
            return JSON.parse('"' + p1 + '"');
          } catch {
            return match;
          }
        });

      return content
        .replace(/\s*<\|.*?\|>\s*/g, '\n\n')
        .trim()
        .replace(/^.+:/, '\n\n$&')
        .replace(/(?<=\n)\n(?=\n)/g, '');
    };

    let prompt = system || '';
    let regexLogs = '';

    if (!messages || messages.length === 0) {
      return { prompt: '', log: '' };
    }

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      if (message && message.content) {
        const role = message.role || 'user';
        const name = message.name;
        const prefixLookup = prefixs[name] || prefixs[role] || role;
        const prefix = '\n\n' + prefixLookup + (name ? ': ' + name : '') + ': ';
        prompt += prefix + message.content.trim();
      } else {
        console.warn('Skipping invalid message object:', message);
      }
    }

    prompt = HyperPmtProcess(prompt);
    if (!claudeMode && prompt) {
      prompt += '\n\n' + prefixs['assistant'] + ':';
    }
    return { prompt: prompt, log: '\n####### Regex:\n' + regexLogs };
  };

  let separator = '';
  if (prefixs.separator) {
    try {
      separator = JSON.parse('"' + prefixs.separator + '"');
    } catch (e) {
      console.error(e);
    }
  }

  const youPmtProcess = function (prompt, separator) {
    if (typeof prompt !== 'string' || !prompt) return '';
    const splitPattern = new RegExp('\\n\\n(?=' + prefixs['assistant'] + ':|' + prefixs['user'] + ':)', 'g');
    return prompt.split(splitPattern).join('\n' + separator + '\n');
  };

  const result = HyperProcess('', messages, true);
  const prompt = result.prompt;

  const youPrompt = prompt.split(/\s*\[-youFileTag-\]\s*/);
  const filePrompt = youPrompt.length > 0 ? youPrompt.pop().trim() : '';

  return {
    role: 'assistant',
    content: youPmtProcess(filePrompt, separator),
  };
}