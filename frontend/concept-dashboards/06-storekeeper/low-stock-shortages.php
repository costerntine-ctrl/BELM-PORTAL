<?php
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Location: /spare-parts-manager/?view=low-stock&module=inventory', true, 302);
exit;
