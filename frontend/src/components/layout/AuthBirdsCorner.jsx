export default function AuthBirdsCorner({ placement = "band" }) {

  const imgClass =

    "absolute bottom-0 right-0 h-full w-auto max-w-none origin-bottom-right opacity-95 drop-shadow-[0_8px_24px_rgba(11,62,175,0.10)] transition-transform duration-300 ease-out group-hover:scale-110";



  const img = <img src="/mp-birds.png" alt="" aria-hidden className={imgClass} />;



  if (placement === "hero") {

    return (

      <div

        className="group absolute bottom-0 right-0 z-[1] h-[84px] w-[min(92vw,300px)] overflow-visible select-none sm:h-[100px] sm:w-[min(92vw,360px)] lg:hidden"

        aria-hidden

      >

        {img}

      </div>

    );

  }



  return (

    <div

      className="group relative hidden h-[84px] w-[min(92vw,360px)] overflow-visible sm:h-[100px] lg:block lg:h-[112px] lg:w-[420px]"

      aria-hidden

    >

      {img}

    </div>

  );

}

