<?php
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Location: /customers-manager/?embed=1&module=customer-overview', true, 302);
exit;
