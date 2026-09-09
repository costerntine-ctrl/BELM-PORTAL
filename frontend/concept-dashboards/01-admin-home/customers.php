<?php
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Location: /customers-manager/?module=customer-overview', true, 302);
exit;
