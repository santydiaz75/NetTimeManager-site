## usar Powershellpara lanzar la captura de pantallas
npm install
npx playwright install
$env:NTM_USER="tu_usuario"
$env:NTM_PASS="tu_password"
$env:NTM_USER_SELECTOR="#emailOrUsername"
$env:NTM_PASS_SELECTOR="#password"
$env:NTM_SUBMIT_SELECTOR="button.btn-login"
npm run shots