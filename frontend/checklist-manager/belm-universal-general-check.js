(function () {
  const button = document.getElementById('universalPresetButton');
  const newButton = document.getElementById('newButton');
  const dialog = document.getElementById('templateDialog');
  if (!button || !newButton || !dialog) return;

  const rows = [
    ['[MECHANICAL] Engine oil level & leaks','DROPDOWN','GREEN',true,['Normal:GREEN','Low:YELLOW','Leak:RED','N/A:NONE']],
    ['[MECHANICAL] Coolant level & radiator condition','DROPDOWN','GREEN',true,['Good:GREEN','Attention:YELLOW','Critical:RED','N/A:NONE']],
    ['[MECHANICAL] Hydraulic oil level & hose leaks','DROPDOWN','GREEN',true,['Normal:GREEN','Low:YELLOW','Leak:RED','N/A:NONE']],
    ['[MECHANICAL] Fuel level & water separator','DROPDOWN','GREEN',true,['Normal:GREEN','Drain Required:YELLOW','Fault:RED','N/A:NONE']],
    ['[MECHANICAL] Belts - fan/alternator tension & cracks','DROPDOWN','GREEN',true,['Good:GREEN','Loose:YELLOW','Cracked:RED','N/A:NONE']],
    ['[MECHANICAL] Air filter condition','DROPDOWN','GREEN',true,['Clean:GREEN','Dirty:YELLOW','Replace:RED','N/A:NONE']],
    ['[MECHANICAL] Fuel filter & oil filter - last change','TEXT','NONE',false,[]],
    ['[MECHANICAL] Engine mounts','DROPDOWN','GREEN',true,['Good:GREEN','Loose:YELLOW','Damaged:RED','N/A:NONE']],
    ['[ELECTRICAL] Battery voltage & terminal corrosion','TEXT','NONE',true,[]],
    ['[ELECTRICAL] Alternator charging','TEXT','NONE',true,[]],
    ['[ELECTRICAL] Starter motor','DROPDOWN','GREEN',true,['OK:GREEN','Attention:YELLOW','Fault:RED','N/A:NONE']],
    ['[ELECTRICAL] Wiring harness / insulation condition','DROPDOWN','GREEN',true,['Good:GREEN','Damaged:YELLOW','Critical:RED','N/A:NONE']],
    ['[ELECTRICAL] Fuses & relays','DROPDOWN','GREEN',true,['OK:GREEN','Attention:YELLOW','Fault:RED','N/A:NONE']],
    ['[ELECTRICAL] ECU / dashboard error codes','TEXT','NONE',false,[]],
    ['[STRUCTURAL/SAFETY] Chassis cracks / welds','DROPDOWN','GREEN',true,['None:GREEN','Attention:YELLOW','Critical:RED','N/A:NONE']],
    ['[STRUCTURAL/SAFETY] Fire extinguisher available & valid','DROPDOWN','GREEN',true,['Valid:GREEN','Expiring Soon:YELLOW','Missing/Expired:RED','N/A:NONE']],
    ['[STRUCTURAL/SAFETY] Seatbelt','DROPDOWN','GREEN',true,['OK:GREEN','Attention:YELLOW','Fault:RED','N/A:NONE']],
    ['[STRUCTURAL/SAFETY] ROPS / FOPS condition','DROPDOWN','GREEN',true,['Good:GREEN','Attention:YELLOW','Damaged:RED','N/A:NONE']],
    ['[STRUCTURAL/SAFETY] Warning decals','DROPDOWN','GREEN',false,['Complete:GREEN','Missing Some:YELLOW','Missing Critical:RED','N/A:NONE']],
    ['[TYRES/TRACKS] Tyre pressure','TEXT','NONE',false,[]],
    ['[TYRES/TRACKS] Tread / track wear','DROPDOWN','GREEN',true,['Good:GREEN','Worn:YELLOW','Replace:RED','N/A:NONE']],
    ['[TYRES/TRACKS] Rim damage','DROPDOWN','GREEN',false,['None:GREEN','Damaged:YELLOW','Critical:RED','N/A:NONE']],
    ['[TYRES/TRACKS] Wheel nuts / torque','DROPDOWN','GREEN',false,['OK:GREEN','Loose:YELLOW','Unsafe:RED','N/A:NONE']],
    ['[REACH STACKER] Spreader / twistlocks','DROPDOWN','GREEN',false,['OK:GREEN','Worn:YELLOW','Fault:RED','N/A:NONE']],
    ['[REACH STACKER] Boom / lift chains - tension & lubrication','DROPDOWN','GREEN',false,['Good:GREEN','Attention:YELLOW','Critical:RED','N/A:NONE']],
    ['[REACH STACKER] RCL calibration','DROPDOWN','GREEN',false,['OK:GREEN','Calibration Due:YELLOW','Fault:RED','N/A:NONE']],
    ['[REACH STACKER] Sideshift function','DROPDOWN','GREEN',false,['OK:GREEN','Attention:YELLOW','Fault:RED','N/A:NONE']],
    ['[REACH STACKER] Container sensors / alignment','DROPDOWN','GREEN',false,['OK:GREEN','Attention:YELLOW','Fault:RED','N/A:NONE']],
    ['[REACH STACKER] Cab tilt mechanism','DROPDOWN','GREEN',false,['OK:GREEN','Attention:YELLOW','Fault:RED','N/A:NONE']],
    ['[REACH STACKER] Lift / tilt / sideshift cylinders','DROPDOWN','GREEN',false,['OK:GREEN','Minor Leak:YELLOW','Leak/Fault:RED','N/A:NONE']],
    ['[REACH STACKER] Load chart available in cab','DROPDOWN','GREEN',false,['Available:GREEN','Outdated:YELLOW','Missing:RED','N/A:NONE']],
    ['[FORKLIFT] Fork cracks / straightness / heel wear','DROPDOWN','GREEN',false,['Good:GREEN','Worn:YELLOW','Critical:RED','N/A:NONE']],
    ['[FORKLIFT] Mast rollers & chains','DROPDOWN','GREEN',false,['Good:GREEN','Attention:YELLOW','Critical:RED','N/A:NONE']],
    ['[FORKLIFT] Carriage condition','DROPDOWN','GREEN',false,['Good:GREEN','Worn:YELLOW','Critical:RED','N/A:NONE']],
    ['[FORKLIFT] Tilt cylinders','DROPDOWN','GREEN',false,['OK:GREEN','Minor Leak:YELLOW','Leak/Fault:RED','N/A:NONE']],
    ['[FORKLIFT] Overhead guard','DROPDOWN','GREEN',false,['Good:GREEN','Attention:YELLOW','Damaged:RED','N/A:NONE']],
    ['[FORKLIFT] Load backrest','DROPDOWN','GREEN',false,['Good:GREEN','Attention:YELLOW','Missing/Damaged:RED','N/A:NONE']],
    ['[FORKLIFT] Counterweight mounting','DROPDOWN','GREEN',false,['Secure:GREEN','Attention:YELLOW','Loose:RED','N/A:NONE']],
    ['[BATCH PLANT] Aggregate bin gate operation','DROPDOWN','GREEN',false,['OK:GREEN','Attention:YELLOW','Fault:RED','N/A:NONE']],
    ['[BATCH PLANT] Weighing system / load-cell calibration','DROPDOWN','GREEN',false,['Calibrated:GREEN','Calibration Due:YELLOW','Fault:RED','N/A:NONE']],
    ['[BATCH PLANT] Conveyor belt tracking / tears / tension','DROPDOWN','GREEN',false,['Good:GREEN','Attention:YELLOW','Critical:RED','N/A:NONE']],
    ['[BATCH PLANT] Cement silo aeration / dust collector','DROPDOWN','GREEN',false,['Good:GREEN','Attention:YELLOW','Fault:RED','N/A:NONE']],
    ['[BATCH PLANT] Mixer blades wear / clearance','DROPDOWN','GREEN',false,['Good:GREEN','Worn:YELLOW','Replace:RED','N/A:NONE']],
    ['[BATCH PLANT] Water metering system','DROPDOWN','GREEN',false,['OK:GREEN','Calibration Due:YELLOW','Fault:RED','N/A:NONE']],
    ['[BATCH PLANT] Admixture dispensers','DROPDOWN','GREEN',false,['OK:GREEN','Calibration Due:YELLOW','Fault:RED','N/A:NONE']],
    ['[BATCH PLANT] Control panel / PLC alarms & sensors','DROPDOWN','GREEN',false,['OK:GREEN','Alarm/Attention:YELLOW','Fault:RED','N/A:NONE']],
    ['[BATCH PLANT] Air compressor / pneumatics','DROPDOWN','GREEN',false,['OK:GREEN','Attention:YELLOW','Fault:RED','N/A:NONE']],
    ['[BATCH PLANT] Pinch-point guards','DROPDOWN','GREEN',false,['Installed:GREEN','Attention:YELLOW','Missing:RED','N/A:NONE']],
    ['[CRANE/LIFTING] Wire ropes - kink / broken strands / corrosion','DROPDOWN','GREEN',false,['Good:GREEN','Attention:YELLOW','Reject:RED','N/A:NONE']],
    ['[CRANE/LIFTING] Hooks / safety latch / cracks','DROPDOWN','GREEN',false,['Good:GREEN','NDT Due:YELLOW','Fault:RED','N/A:NONE']],
    ['[CRANE/LIFTING] Load Moment Indicator (LMI)','DROPDOWN','GREEN',false,['OK:GREEN','Calibration Due:YELLOW','Fault:RED','N/A:NONE']],
    ['[CRANE/LIFTING] Limit switches','DROPDOWN','GREEN',false,['OK:GREEN','Attention:YELLOW','Fault:RED','N/A:NONE']],
    ['[CRANE/LIFTING] Outriggers / pads / hydraulic leaks','DROPDOWN','GREEN',false,['Good:GREEN','Attention:YELLOW','Unsafe:RED','N/A:NONE']],
    ['[CRANE/LIFTING] Slings & chains certification','DROPDOWN','GREEN',false,['Valid:GREEN','Expiring Soon:YELLOW','Expired/Unsafe:RED','N/A:NONE']],
    ['[GENERATOR/COMPRESSOR] Oil & coolant level','DROPDOWN','GREEN',false,['Normal:GREEN','Attention:YELLOW','Critical:RED','N/A:NONE']],
    ['[GENERATOR/COMPRESSOR] AVR condition','DROPDOWN','GREEN',false,['OK:GREEN','Attention:YELLOW','Fault:RED','N/A:NONE']],
    ['[GENERATOR/COMPRESSOR] Control panel voltage / frequency','TEXT','NONE',false,[]],
    ['[GENERATOR/COMPRESSOR] Air filter','DROPDOWN','GREEN',false,['Clean:GREEN','Dirty:YELLOW','Replace:RED','N/A:NONE']],
    ['[GENERATOR/COMPRESSOR] Fuel tank & lines','DROPDOWN','GREEN',false,['Good:GREEN','Attention:YELLOW','Leak:RED','N/A:NONE']],
    ['[GENERATOR/COMPRESSOR] Exhaust system leaks','DROPDOWN','GREEN',false,['None:GREEN','Attention:YELLOW','Critical:RED','N/A:NONE']],
    ['[GENERATOR/COMPRESSOR] Earthing / grounding','DROPDOWN','GREEN',false,['OK:GREEN','Attention:YELLOW','Fault:RED','N/A:NONE']],
    ['[DOCUMENTATION] Daily inspection form completed','DROPDOWN','GREEN',true,['Yes:GREEN','No:YELLOW','N/A:NONE']],
    ['[DOCUMENTATION] Job card / service history up to date','DROPDOWN','GREEN',true,['Up to Date:GREEN','Attention:YELLOW','Overdue:RED','N/A:NONE']],
    ['[DOCUMENTATION] Insurance / machine certification','DROPDOWN','GREEN',false,['Valid:GREEN','Expiring Soon:YELLOW','Expired:RED','N/A:NONE']],
    ['[DOCUMENTATION] Lifting certification / LOLER where applicable','DROPDOWN','GREEN',false,['Valid:GREEN','Expiring Soon:YELLOW','Expired:RED','N/A:NONE']],
    ['[DOCUMENTATION] Operator licence / certificate','DROPDOWN','GREEN',false,['Valid:GREEN','Expiring Soon:YELLOW','Expired:RED','N/A:NONE']],
    ['[DOCUMENTATION] Current machine hours','NUMBER','NONE',false,[]],
    ['[DOCUMENTATION] Last service date / hours','TEXT','NONE',false,[]],
    ['[DOCUMENTATION] Next service due date / hours','TEXT','NONE',false,[]],
    ['[REPORT] Technician findings / comments','TEXT','NONE',false,[]],
    ['[REPORT] Corrective action / recommendation','TEXT','NONE',false,[]]
  ];

  function setValue(id, value) {
    const element = document.getElementById(id);
    if (!element) return;
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findItemCards() {
    return Array.from(document.querySelectorAll('#itemList .item-card'));
  }

  function updateOption(card, optionIndex, pairText) {
    const pair = pairText.split(':');
    const option = card.querySelectorAll('.dropdown-option')[optionIndex];
    if (!option) return;
    const valueInput = option.querySelector('[data-option-field="value"]');
    const levelSelect = option.querySelector('[data-option-field="safetyLevel"]');
    if (valueInput) {
      valueInput.value = pair[0];
      valueInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (levelSelect) {
      levelSelect.value = pair[1] || 'GREEN';
      levelSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function addItemAndFill(row) {
    document.getElementById('addItemButton').click();
    let card = findItemCards().slice(-1)[0];
    if (!card) return;
    const label = card.querySelector('[data-field="label"]');
    const type = card.querySelector('[data-field="inputType"]');
    if (label) {
      label.value = row[0];
      label.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (type) {
      type.value = row[1];
      type.dispatchEvent(new Event('change', { bubbles: true }));
    }

    card = findItemCards().slice(-1)[0];
    const safety = card?.querySelector('[data-field="safetyLevel"]');
    const required = card?.querySelector('[data-field="isRequired"]');
    if (safety) {
      safety.value = row[2];
      safety.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (required) {
      required.checked = row[3];
      required.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (row[1] !== 'DROPDOWN' || !row[4].length) return;
    card = findItemCards().slice(-1)[0];
    updateOption(card, 0, row[4][0]);
    for (let i = 1; i < row[4].length; i++) {
      card = findItemCards().slice(-1)[0];
      card?.querySelector('[data-add-option]')?.click();
      card = findItemCards().slice(-1)[0];
      updateOption(card, i, row[4][i]);
    }
  }

  button.addEventListener('click', () => {
    newButton.click();
    setValue('templateName', 'BELM Universal General Machine Check');
    setValue('machineType', 'Universal');
    setValue('serviceType', 'GENERAL CHECK');
    const first = findItemCards()[0];
    first?.querySelector('[data-remove]')?.click();
    rows.forEach(addItemAndFill);
    Array.from(document.querySelectorAll('#servicePartList [data-remove-service-part]')).forEach((node) => node.click());
    const title = document.getElementById('dialogTitle');
    if (title) title.textContent = 'BELM Universal General Machine Check';
  });
})();
