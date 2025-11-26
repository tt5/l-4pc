import { Title } from '@solidjs/meta';
import RegisterForm from '~/components/Auth/RegisterForm';

export default function Register() {
  return (
    <>
      <Title>Register - Superstar</Title>
      <h1>Create your account</h1>
      <RegisterForm />
    </>
  );
}
