<?php
// Workshop Manager / Technical Department checklist flow:
// Inspection Checklists -> customer card -> View Customer Machine -> Check Up.
header('Location: /customers-manager/?module=workshop&inspectionChecklists=1', true, 302);
exit;
