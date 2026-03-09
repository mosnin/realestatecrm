import { cn } from '@/lib/utils';

interface BrandLogoProps {
  className?: string;
  alt?: string;
}

const BLACK_LOGO_URL =
  'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjZBWKPpQWhOWZYF6Ps6Ai7pbDr5-Ov-ApWFhyWTuM5lE0klzKzdYtYLWUrve1ipi1EkcokNZzCWibZVbcT55a1o3_v-lR1nd4_8ABc3F4eYokUxAjDBx4Cs4o6voUe9C-Cg_J7HFLZVSQ4yILOX8tduBa43213_90NVAGWETvXrueuFlllaSc4WMO9C0si/s320/chippig_black_logo.png';
const WHITE_LOGO_URL =
  'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhi8LfOAxYArGnioj7DXP-UDyU83pZSPw06CPkSxfjjBqJ9YELgJUCXCBcLRAEA1T27i8hf7CiZHRnwTskAB19NY4GCDfPBNIt_oZ2x9OBK13ROf4Abx7VeuS9vXJpZUNLE5EP0esoNlP4c-YCzYuUUk5hRr0KIcQnsWcws9cMSwvd-E4YnVA0h0sAEiMQf/s2100/chippi_white_logo.png';

export function BrandLogo({ className, alt = 'Chippi logo' }: BrandLogoProps) {
  return (
    <span className={cn('relative inline-flex items-center', className)}>
      <img src={BLACK_LOGO_URL} alt={alt} className="block h-full w-auto dark:hidden" />
      <img src={WHITE_LOGO_URL} alt={alt} className="hidden h-full w-auto dark:block" />
    </span>
  );
}
