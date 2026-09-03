import {
  Check,
  ChevronDown,
  Crosshair,
  Loader2,
  MapPin,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getAllCitiesOfCountry,
  getCitiesOfState,
  getCountries,
  getStatesOfCountry,
  type ICity,
  type ICountry,
  type IState,
} from '@countrystatecity/countries-browser';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { HomeLocation } from '@/auth/auth-api';

interface LocationPickerProps {
  value: HomeLocation | null;
  onChange: (location: HomeLocation | null) => void;
  onValidityChange?: (valid: boolean) => void;
  disabled?: boolean;
}

interface ReverseGeocodeAddress {
  country_code?: string;
  state?: string;
  province?: string;
  region?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
}

interface ReverseGeocodeResponse {
  address?: ReverseGeocodeAddress;
}

interface SelectOption {
  key: string;
  label: string;
  keywords?: string;
}

function normalizeLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase();
}

function cityCoordinates(city: ICity) {
  const latitude = Number(city.latitude);
  const longitude = Number(city.longitude);

  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
}

function LocationCombobox({
  label,
  value,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  options,
  loading = false,
  disabled = false,
  onSelect,
}: {
  label: string;
  value: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  options: SelectOption[];
  loading?: boolean;
  disabled?: boolean;
  onSelect: (option: SelectOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.key === value);

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled || loading}
            aria-expanded={open}
            className={cn(
              'flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-border bg-background px-3.5 py-2.5 text-left text-sm transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60',
              !selectedOption && 'text-muted-foreground',
            )}
          >
            <span className="truncate">
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {placeholder}
                </span>
              ) : (
                selectedOption?.label ?? placeholder
              )}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[min(90vw,380px)] overflow-hidden p-0"
        >
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyLabel}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.key}
                    value={`${option.label} ${option.key} ${option.keywords ?? ''}`}
                    onSelect={() => {
                      onSelect(option);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4',
                        value === option.key
                          ? 'opacity-100 text-primary'
                          : 'opacity-0',
                      )}
                    />
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function reverseGeocodeErrorMessage(
  error: { code: number },
  t: (key: string) => string,
) {
  return error.code === 1
    ? t('identity.location.permissionDenied')
    : t('identity.location.detectionFailed');
}

function isGeolocationError(
  error: unknown,
): error is GeolocationPositionError {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'number',
  );
}

async function reverseGeocode(latitude: number, longitude: number) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=10&lat=${latitude}&lon=${longitude}`,
    {
      headers: {
        Accept: 'application/json',
        'Accept-Language': document.documentElement.lang || 'es',
      },
    },
  );

  if (!response.ok) {
    throw new Error('reverse-geocoding-failed');
  }

  return (await response.json()) as ReverseGeocodeResponse;
}

function findExactOption<T extends { name: string }>(
  options: T[],
  names: string[],
): T | undefined {
  const normalizedNames = names
    .filter(Boolean)
    .map(normalizeLabel);

  return options.find((option) =>
    normalizedNames.includes(normalizeLabel(option.name)),
  );
}

export function LocationPicker({
  value,
  onChange,
  onValidityChange,
  disabled = false,
}: LocationPickerProps) {
  const { t } = useTranslation('profile');
  const [countries, setCountries] = useState<ICountry[]>([]);
  const [states, setStates] = useState<IState[]>([]);
  const [cities, setCities] = useState<ICity[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [statesLoading, setStatesLoading] = useState(false);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [statesReady, setStatesReady] = useState(false);
  const [dataError, setDataError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [countryCode, setCountryCode] = useState(
    value?.countryCode ?? '',
  );
  const [stateCode, setStateCode] = useState(
    value?.regionCode ?? '',
  );
  const [cityName, setCityName] = useState(value?.city ?? '');

  useEffect(() => {
    let cancelled = false;

    setCountriesLoading(true);
    setDataError('');

    void getCountries()
      .then((loadedCountries) => {
        if (!cancelled) {
          setCountries(loadedCountries);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDataError(t('identity.location.dataLoadError'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCountriesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    setCountryCode(value?.countryCode ?? '');
    setStateCode(value?.regionCode ?? '');
    setCityName(value?.city ?? '');
  }, [value?.countryCode, value?.regionCode, value?.city]);

  useEffect(() => {
    let cancelled = false;

    setStates([]);
    setCities([]);
    setStatesReady(false);
    setStateCode(
      value?.countryCode === countryCode
        ? value?.regionCode ?? ''
        : '',
    );

    if (!countryCode) {
      setStatesLoading(false);
      return;
    }

    setStatesLoading(true);
    setDataError('');

    void getStatesOfCountry(countryCode)
      .then((loadedStates) => {
        if (!cancelled) {
          setStates(loadedStates);
          setStatesReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDataError(t('identity.location.dataLoadError'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setStatesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [countryCode, t, value?.regionCode]);

  useEffect(() => {
    let cancelled = false;

    setCities([]);
    setCityName(
      countryCode === value?.countryCode
        ? value?.city ?? ''
        : '',
    );

    if (
      !countryCode ||
      !statesReady ||
      (states.length > 0 && !stateCode)
    ) {
      setCitiesLoading(false);
      return;
    }

    setCitiesLoading(true);
    setDataError('');

    const cityRequest =
      states.length > 0
        ? getCitiesOfState(countryCode, stateCode)
        : getAllCitiesOfCountry(countryCode);

    void cityRequest
      .then((loadedCities) => {
        if (!cancelled) {
          setCities(loadedCities);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDataError(t('identity.location.dataLoadError'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCitiesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    countryCode,
    stateCode,
    states,
    statesReady,
    t,
    value?.city,
    value?.countryCode,
  ]);

  const selectedCountry = useMemo(
    () =>
      countries.find(
        (country) => country.iso2.toUpperCase() === countryCode,
      ),
    [countries, countryCode],
  );

  const selectedState = useMemo(
    () => states.find((state) => state.iso2 === stateCode),
    [stateCode, states],
  );

  const countryOptions = useMemo(
    () =>
      countries.map((country) => ({
        key: country.iso2.toUpperCase(),
        label: country.name,
        keywords: `${country.native} ${country.iso3}`,
      })),
    [countries],
  );

  const stateOptions = useMemo(
    () =>
      states.map((state) => ({
        key: state.iso2,
        label: state.name,
        keywords: state.native ?? '',
      })),
    [states],
  );

  const cityOptions = useMemo(
    () =>
      cities.map((city) => ({
        key: String(city.id),
        label: city.name,
        keywords: `${city.native ?? ''} ${city.state_code}`,
      })),
    [cities],
  );

  function selectCountry(option: SelectOption) {
    setCountryCode(option.key);
    setStateCode('');
    setCityName('');
    setLocationError('');
    onValidityChange?.(false);
  }

  function selectState(option: SelectOption) {
    setStateCode(option.key);
    setCityName('');
    setLocationError('');
    onValidityChange?.(false);
  }

  function selectCity(option: SelectOption) {
    const city = cities.find((item) => String(item.id) === option.key);
    if (!city || !selectedCountry) {
      return;
    }

    const coordinates = cityCoordinates(city);
    if (!coordinates) {
      setLocationError(t('identity.location.cityDataError'));
      onValidityChange?.(false);
      return;
    }

    setCityName(city.name);
    setLocationError('');
    onChange({
      countryCode: selectedCountry.iso2.toUpperCase(),
      country: selectedCountry.name,
      regionCode: selectedState?.iso2 ?? null,
      region: selectedState?.name ?? null,
      city: city.name,
      ...coordinates,
    });
    onValidityChange?.(true);
  }

  function clearLocation() {
    setCountryCode('');
    setStateCode('');
    setCityName('');
    setLocationError('');
    onChange(null);
    onValidityChange?.(true);
  }

  async function useCurrentLocation() {
    setLocationError('');

    if (!navigator.geolocation) {
      setLocationError(t('identity.location.geolocationUnsupported'));
      return;
    }

    setDetecting(true);

    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            maximumAge: 300000,
            timeout: 12000,
          });
        },
      );
      const reverseResult = await reverseGeocode(
        position.coords.latitude,
        position.coords.longitude,
      );
      const address = reverseResult.address;
      const reverseCountryCode = address?.country_code
        ?.trim()
        .toUpperCase();

      if (!reverseCountryCode) {
        throw new Error('country-not-found');
      }

      const country = countries.find(
        (item) => item.iso2.toUpperCase() === reverseCountryCode,
      );
      if (!country) {
        throw new Error('country-not-found');
      }

      const loadedStates = await getStatesOfCountry(
        country.iso2,
      );
      const regionNames = [
        address?.state,
        address?.province,
        address?.region,
      ].filter((name): name is string => Boolean(name));
      const state =
        loadedStates.length > 0
          ? findExactOption(loadedStates, regionNames)
          : undefined;

      if (loadedStates.length > 0 && !state) {
        throw new Error('region-not-found');
      }

      const loadedCities = state
        ? await getCitiesOfState(country.iso2, state.iso2)
        : await getAllCitiesOfCountry(country.iso2);
      const cityNames = [
        address?.city,
        address?.town,
        address?.village,
        address?.municipality,
      ].filter((name): name is string => Boolean(name));
      const city = findExactOption(loadedCities, cityNames);

      if (!city) {
        throw new Error('city-not-found');
      }

      const coordinates = cityCoordinates(city);
      if (!coordinates) {
        throw new Error('city-coordinates-not-found');
      }

      setCountryCode(country.iso2.toUpperCase());
      setStateCode(state?.iso2 ?? '');
      setCityName(city.name);
      onChange({
        countryCode: country.iso2.toUpperCase(),
        country: country.name,
        regionCode: state?.iso2 ?? null,
        region: state?.name ?? null,
        city: city.name,
        ...coordinates,
      });
      onValidityChange?.(true);
    } catch (error) {
      if (isGeolocationError(error)) {
        setLocationError(reverseGeocodeErrorMessage(error, t));
      } else {
        setLocationError(t('identity.location.detectionFailed'));
      }
    } finally {
      setDetecting(false);
    }
  }

  const displayedCountry =
    selectedCountry?.name ??
    (countryCode === value?.countryCode ? value?.country : undefined);
  const displayedRegion =
    selectedState?.name ??
    (stateCode === value?.regionCode ? value?.region : undefined);

  return (
    <div className="mt-3 space-y-4">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-center rounded-xl border-primary/50 text-primary hover:bg-primary/10"
        onClick={() => {
          void useCurrentLocation();
        }}
        disabled={disabled || detecting}
      >
        {detecting ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Crosshair />
        )}
        {detecting
          ? t('identity.location.detecting')
          : t('identity.location.useCurrent')}
      </Button>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t('identity.location.privacy')}
      </p>

      <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span>{t('identity.location.or')}</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <LocationCombobox
          label={t('identity.location.country')}
          value={countryCode}
          placeholder={t('identity.location.chooseCountry')}
          searchPlaceholder={t('identity.location.searchCountry')}
          emptyLabel={t('identity.location.noMatches')}
          options={countryOptions}
          loading={countriesLoading}
          disabled={disabled}
          onSelect={selectCountry}
        />

        <LocationCombobox
          label={t('identity.location.region')}
          value={stateCode}
          placeholder={
            statesReady && states.length === 0
              ? t('identity.location.regionNotRequired')
              : t('identity.location.chooseRegion')
          }
          searchPlaceholder={t('identity.location.searchRegion')}
          emptyLabel={t('identity.location.noMatches')}
          options={stateOptions}
          loading={statesLoading}
          disabled={
            disabled ||
            !countryCode ||
            (statesReady && states.length === 0)
          }
          onSelect={selectState}
        />

        <LocationCombobox
          label={t('identity.location.city')}
          value={
            cityOptions.find(
              (option) => option.label === cityName,
            )?.key ?? ''
          }
          placeholder={t('identity.location.chooseCity')}
          searchPlaceholder={t('identity.location.searchCity')}
          emptyLabel={t('identity.location.noMatches')}
          options={cityOptions}
          loading={citiesLoading}
          disabled={
            disabled ||
            !countryCode ||
            !statesReady ||
            (states.length > 0 && !stateCode)
          }
          onSelect={selectCity}
        />
      </div>

      {(dataError || locationError) && (
        <p
          className="auth-error"
          role="alert"
        >
          {dataError || locationError}
        </p>
      )}

      {(value || cityName) && (
        <button
          type="button"
          className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground transition hover:text-foreground disabled:opacity-60"
          onClick={clearLocation}
          disabled={disabled}
        >
          <X className="h-3.5 w-3.5" />
          {t('identity.location.remove')}
        </button>
      )}

      {value && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          {value.city}, {value.country}
        </p>
      )}

      {displayedCountry && !value && displayedRegion && cityName && (
        <p className="sr-only">
          {displayedRegion}, {displayedCountry}, {cityName}
        </p>
      )}
    </div>
  );
}