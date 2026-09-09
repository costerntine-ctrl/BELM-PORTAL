<?php
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Location: /spare-parts-manager/?view=stock-out&module=inventory', true, 302);
exit;
