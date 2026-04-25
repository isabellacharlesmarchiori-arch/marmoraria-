ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_perfil_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_perfil_check
  CHECK (perfil IN ('vendedor', 'admin', 'medidor', 'admin_medidor', 'vendedor_medidor'));

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_perfil_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_perfil_check
  CHECK (perfil IN ('vendedor', 'admin', 'medidor', 'admin_medidor', 'vendedor_medidor'));
