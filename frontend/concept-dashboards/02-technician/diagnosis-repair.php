<?php
header('Cache-Control: no-store, no-cache, must-revalidate');
// Technician Diagnosis / Inspection is not a free-standing report. It must
// originate from an assigned Job Card, or from a machine issue that has been
// raised by a Checklist / Operator report and entered the Breakdown workflow.
header('Location: /breakdown-workflow/?actor=technician&view=diagnosis', true, 302);
exit;
